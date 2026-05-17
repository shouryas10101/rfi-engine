import { PrismaClient } from "@prisma/client";
import { evaluateDeterministic } from "../dist/evaluation/deterministic.js";
import { ParameterSpecSchema } from "../dist/domain/parameter.js";
import { buildComplianceReport } from "../dist/compliance/report.js";

const p = new PrismaClient();

const sessions = await p.session.findMany({
  where: { status: { in: ["completed", "failed_veto"] } },
  include: {
    rfi: { include: { project: true, parameters: true } },
    supplier: { include: { catalogue: true } },
    responses: { include: { parameter: true } },
    turns: { orderBy: { createdAt: "asc" } },
  },
});
console.log("Sessions found:", sessions.length);

function formatForEval(v) {
  if (v == null) return "";
  if (Array.isArray(v) && v.length === 2) return `${v[0]} ${v[1]}`;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v);
}

function findCatalogueValue(params, key, label) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const nKey = norm(key), nLabel = norm(label);
  for (const [k, v] of Object.entries(params)) {
    const nk = norm(k);
    if (nk === nKey || nk === nLabel) return v;
  }
  for (const [k, v] of Object.entries(params)) {
    const nk = norm(k);
    if (nk.includes(nKey) || nKey.includes(nk) || nk.includes(nLabel) || nLabel.includes(nk)) return v;
  }
  const tokens = [...new Set([...(nKey.match(/[a-z0-9]{3,}/g) ?? []), ...(nLabel.match(/[a-z0-9]{3,}/g) ?? [])])];
  for (const [k, v] of Object.entries(params)) {
    const kToks = norm(k).match(/[a-z0-9]{3,}/g) ?? [];
    if (tokens.some((t) => kToks.some((kt) => kt.includes(t) || t.includes(kt)))) return v;
  }
  return undefined;
}

function checkVariantValue(value, spec) {
  if (value === undefined || value === null) return "inconclusive";
  const raw = formatForEval(value);
  const result = evaluateDeterministic(raw, spec);
  if (!result) return "inconclusive";
  return result.verdict === "fail" ? "fail" : result.verdict === "pass" ? "pass" : "inconclusive";
}

function extractElim(turns) {
  const result = {};
  for (const t of turns) {
    const m = t.content.match(/^ELIM — ([^:]+): failed "([^"]+)" — (.+)$/);
    if (m && !result[m[1]]) result[m[1]] = { eliminatedAt: m[2], eliminationReason: m[3] };
  }
  return result;
}

function computeGthMatched(productCode, turns) {
  return turns.filter((t) => t.content.startsWith(`GTH_PASS — ${productCode}: `)).length;
}

for (const session of sessions) {
  const nc = (s) => s.toLowerCase().replace(/[\s\-_]/g, "");
  const tCat = nc(session.rfi.componentCategory);
  const relCatalogue = session.supplier.catalogue.filter((item) => {
    const ic = nc(item.componentCategory);
    return ic === tCat || ic.includes(tCat) || tCat.includes(ic);
  });
  const mhParams = session.rfi.parameters.filter((p) => p.phase === "must_have");
  const gthParams = session.rfi.parameters.filter((p) => p.phase === "good_to_have");
  const mhResponses = session.responses.filter((r) => r.parameter.phase === "must_have");
  const elimTurns = session.turns.filter((t) => t.authorRole === "system" && t.content.startsWith("ELIM —"));
  const gthTurns = session.turns.filter(
    (t) => t.authorRole === "system" && (t.content.startsWith("GTH_PASS —") || t.content.startsWith("GTH_FAIL —")),
  );
  const eliminated = extractElim(elimTurns);

  const variantStatuses = relCatalogue.map((item) => {
    const params = item.parameters;
    const elim = eliminated[item.productCode];
    let mhPassed = 0;
    for (const resp of mhResponses) {
      if (elim && elim.eliminatedAt === resp.parameter.label) break;
      let spec;
      try { spec = ParameterSpecSchema.parse(resp.parameter.spec); } catch { mhPassed++; continue; }
      if (spec.type === "text" || spec.type === "subjective") { mhPassed++; continue; }
      const val = findCatalogueValue(params, resp.parameter.key, resp.parameter.label);
      if (checkVariantValue(val, spec) !== "fail") mhPassed++;
      else break;
    }
    return {
      productCode: item.productCode,
      status: elim ? "eliminated" : "active",
      eliminatedAt: elim?.eliminatedAt ?? null,
      eliminationReason: elim?.eliminationReason ?? null,
      mhPassed,
      mhTotal: mhParams.length,
      gthMatched: computeGthMatched(item.productCode, gthTurns),
      gthTotal: gthParams.length,
    };
  });

  const payload = buildComplianceReport({
    rfi: {
      id: session.rfi.id,
      title: session.rfi.title,
      componentCategory: session.rfi.componentCategory,
      project: {
        name: session.rfi.project.name,
        vehicleType: session.rfi.project.vehicleType,
        targetMarket: session.rfi.project.targetMarket,
      },
    },
    supplier: {
      id: session.supplier.id,
      name: session.supplier.name,
      contactEmail: session.supplier.contactEmail,
    },
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    responses: session.responses.map((r) => ({
      parameter: {
        key: r.parameter.key,
        label: r.parameter.label,
        importance: r.parameter.importance,
        phase: r.parameter.phase,
      },
      rawResponse: r.rawResponse,
      verdict: r.verdict,
      confidence: r.confidence,
      rationale: r.rationale,
      modificationDistance: r.modificationDistance,
      evaluatedBy: r.evaluatedBy,
    })),
    variants: variantStatuses,
  });

  await p.complianceReport.create({ data: { sessionId: session.id, payload } });
  console.log(
    `Regenerated session ${session.id} — recommended: ${payload.variants.recommended?.productCode ?? "none"} — variants: ${variantStatuses.length}`,
  );
}

await p.$disconnect();
console.log("Done.");
