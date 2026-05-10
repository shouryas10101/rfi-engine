import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../db/client.js";

async function main() {
  await prisma.complianceReport.deleteMany();
  await prisma.parameterResponse.deleteMany();
  await prisma.document.deleteMany();
  await prisma.turn.deleteMany();
  await prisma.session.deleteMany();
  await prisma.rFIParameter.deleteMany();
  await prisma.rFI.deleteMany();
  await prisma.bidlistEntry.deleteMany();
  await prisma.catalogueItem.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.user.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.project.deleteMany();
  await prisma.tenant.deleteMany();

  const tenant = await prisma.tenant.create({
    data: { name: "Tata Motors", slug: "tml" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "priya@tml.test",
      fullName: "Priya Sharma",
      passwordHash,
      role: "TML_ADMIN",
    },
  });

  const project = await prisma.project.create({
    data: {
      tenantId: tenant.id,
      name: "Harrier EV — Front Brake Module",
      vehicleType: "SUV (electric)",
      sop: new Date("2026-09-01"),
      targetMarket: "India + EU",
    },
  });

  await prisma.rFI.create({
    data: {
      projectId: project.id,
      title: "Front Brake Caliper RFI — Harrier EV",
      componentCategory: "Brake Caliper",
      status: "active",
      parameters: {
        create: [
          {
            phase: "general",
            importance: "general",
            key: "project_acknowledged",
            label: "Confirm you have received and reviewed the Harrier EV brief",
            type: "boolean",
            spec: { type: "boolean", expected: true },
            weight: 1,
            ordering: 0,
          },
          {
            phase: "general",
            importance: "general",
            key: "supplier_product_family",
            label: "Which product family from your catalogue would you propose for this RFI?",
            type: "text",
            spec: { type: "text", prompt: "Name the product family or model line." },
            weight: 1,
            ordering: 1,
          },
          {
            phase: "must_have",
            importance: "must",
            key: "max_braking_force_kn",
            label: "Maximum braking force (kN) the caliper can sustain",
            type: "numeric_range",
            spec: { type: "numeric_range", min: 28, max: null, unit: "kN" },
            weight: 2,
            ordering: 0,
          },
          {
            phase: "must_have",
            importance: "must",
            key: "operating_temp_range",
            label: "Operating temperature envelope (state min and max in °C)",
            type: "numeric_subset_range",
            spec: { type: "numeric_subset_range", min: -30, max: 600, unit: "°C" },
            weight: 2,
            ordering: 1,
          },
          {
            phase: "must_have",
            importance: "must",
            key: "regen_brake_compatible",
            label: "Compatible with regenerative braking control loop?",
            type: "boolean",
            spec: { type: "boolean", expected: true },
            weight: 2,
            ordering: 2,
          },
          {
            phase: "must_have",
            importance: "must",
            key: "homologation_standard",
            label: "Which homologation standard does the part meet?",
            type: "enum",
            spec: { type: "enum", allowed: ["ECE-R13", "FMVSS-135", "AIS-018"] },
            weight: 1.5,
            ordering: 3,
          },
          {
            phase: "good_to_have",
            importance: "good",
            key: "weight_kg",
            label: "Caliper assembly weight (kg)",
            type: "numeric_range",
            spec: { type: "numeric_range", min: null, max: 4.2, unit: "kg" },
            weight: 1.2,
            ordering: 0,
          },
          {
            phase: "good_to_have",
            importance: "good",
            key: "piston_count",
            label: "Number of pistons per caliper",
            type: "enum",
            spec: { type: "enum", allowed: ["2", "4", "6"] },
            weight: 0.8,
            ordering: 1,
          },
          {
            phase: "good_to_have",
            importance: "good",
            key: "warranty_months",
            label: "Warranty offered (months)",
            type: "numeric_range",
            spec: { type: "numeric_range", min: 36, max: null, unit: "months" },
            weight: 1,
            ordering: 2,
          },
          {
            phase: "subjective",
            importance: "subjective",
            key: "modularity_across_platforms",
            label: "Modularity across vehicle platforms",
            type: "subjective",
            spec: {
              type: "subjective",
              description:
                "Describe how the proposed caliper can be reused across other Tata SUV/electric platforms with minimal mechanical or harness modification.",
              acceptanceCriteria:
                "A pass requires evidence the same caliper (or a near-variant) is already used in at least two other production platforms.",
            },
            weight: 1.5,
            ordering: 0,
          },
          {
            phase: "subjective",
            importance: "subjective",
            key: "noise_vibration_handling",
            label: "Noise, vibration and harshness (NVH) characteristics",
            type: "subjective",
            spec: {
              type: "subjective",
              description:
                "Describe NVH performance under hard braking and any anti-squeal measures.",
            },
            weight: 1,
            ordering: 1,
          },
        ],
      },
    },
  });

  console.log("\nSeed complete.");
  console.log("───────────────────────────────────");
  console.log("Login: priya@tml.test / password123  (TML admin)");
  console.log("\nNo suppliers seeded. Add them via the Suppliers page in the UI.");
  console.log("Each supplier you add generates an invitation link to share with their engineer.\n");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
