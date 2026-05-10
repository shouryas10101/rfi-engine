import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SESSION_ID = "cmovec4ze004jzjat2istzt49";

async function main() {
  const session = await prisma.session.findUnique({
    where: { id: SESSION_ID },
    include: { rfi: { include: { parameters: true } }, supplier: { include: { catalogue: true } } },
  });
  if (!session) { console.log("session not found"); return; }

  console.log("\n=== RFI Parameters ===");
  for (const p of session.rfi.parameters) {
    console.log(`[${p.phase}] key="${p.key}" label="${p.label}" spec=${JSON.stringify(p.spec)}`);
  }

  console.log("\n=== Catalogue Items (parameters keys) ===");
  for (const item of session.supplier.catalogue) {
    console.log(`\n--- ${item.productCode} (${item.componentCategory}) ---`);
    const params = item.parameters as Record<string, unknown>;
    for (const [k, v] of Object.entries(params)) {
      console.log(`  "${k}": ${JSON.stringify(v)}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
