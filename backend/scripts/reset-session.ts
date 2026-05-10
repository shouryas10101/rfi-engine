import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const latest = await prisma.session.findFirst({
    where: { rfi: { title: "Driveline" } },
    orderBy: { startedAt: "desc" },
  });
  if (!latest) throw new Error("No Driveline session found");
  const SESSION_ID = latest.id;
  console.log("Resetting session:", SESSION_ID);

  const deletedTurns = await prisma.turn.deleteMany({ where: { sessionId: SESSION_ID } });
  const deletedResponses = await prisma.parameterResponse.deleteMany({ where: { sessionId: SESSION_ID } });
  const deletedReports = await prisma.complianceReport.deleteMany({ where: { sessionId: SESSION_ID } });

  const session = await prisma.session.update({
    where: { id: SESSION_ID },
    data: { status: "pending", currentPhase: "general", completedAt: null, activatedAt: null },
  });

  console.log(`Deleted ${deletedTurns.count} turns, ${deletedResponses.count} responses, ${deletedReports.count} reports`);
  console.log("Session reset to:", session.status, session.currentPhase);

  const rfi = await prisma.rFI.findUnique({ where: { id: session.rfiId } });
  console.log("RFI:", rfi?.title, "| componentCategory:", rfi?.componentCategory);

  const catalogue = await prisma.catalogueItem.findMany({ where: { supplierId: session.supplierId } });
  console.log(`Catalogue items (${catalogue.length}):`);
  for (const item of catalogue) {
    console.log(`  - ${item.productCode} | category: ${item.componentCategory}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
