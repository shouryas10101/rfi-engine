import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const rfis = await p.rFI.findMany({ take: 10 });
  console.log("RFIs:", rfis.map(r => `${r.id} | "${r.title}" | ${r.componentCategory}`).join("\n"));

  const sessions = await p.session.findMany({
    include: { rfi: true, supplier: true },
    orderBy: { startedAt: "desc" },
    take: 10,
  });
  console.log("\nSessions:", sessions.length);
  for (const x of sessions) {
    console.log(x.id, "|", x.status, "|", x.supplier.name, "|", x.rfi.title);
  }
}
main().catch(console.error).finally(() => p.$disconnect());
