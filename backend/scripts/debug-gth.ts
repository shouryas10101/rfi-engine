import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const session = await p.session.findFirst({
    where: { rfi: { title: "Driveline" } },
    orderBy: { startedAt: "desc" },
    include: { rfi: { include: { parameters: true } }, supplier: { include: { catalogue: true } } },
  });
  if (!session) throw new Error("No session");
  console.log("Session:", session.id, session.status, session.currentPhase);

  const gthParams = session.rfi.parameters.filter(p => p.phase === "good_to_have");
  console.log("\nGTH params:", gthParams.map(p => p.label).join(", "));

  const systemTurns = await p.turn.findMany({
    where: { sessionId: session.id, authorRole: "system" },
    orderBy: { createdAt: "asc" },
  });
  console.log("\nAll system turns:");
  for (const t of systemTurns) console.log(" ", t.content);

  const responses = await p.parameterResponse.findMany({
    where: { sessionId: session.id },
    include: { parameter: true },
  });
  console.log("\nParameter responses:");
  for (const r of responses) console.log(" ", r.parameter.phase, r.parameter.label, "→", r.verdict);
}
main().catch(console.error).finally(() => p.$disconnect());
