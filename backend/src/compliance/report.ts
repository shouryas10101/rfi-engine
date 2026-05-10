import type { Verdict } from "../domain/parameter.js";

export type ReportInput = {
  rfi: {
    id: string;
    title: string;
    componentCategory: string;
    project: { name: string; vehicleType: string; targetMarket: string | null };
  };
  supplier: { id: string; name: string; contactEmail: string };
  session: {
    id: string;
    status: string;
    startedAt: Date;
    completedAt: Date | null;
  };
  responses: {
    parameter: { key: string; label: string; importance: string; phase: string };
    rawResponse: string;
    verdict: Verdict;
    confidence: number;
    rationale: string;
    modificationDistance: number;
    evaluatedBy: string;
  }[];
};

export type ComplianceReportPayload = {
  schemaVersion: "1.0";
  generatedAt: string;
  meta: {
    project: ReportInput["rfi"]["project"];
    rfi: { id: string; title: string; componentCategory: string };
    supplier: ReportInput["supplier"];
    session: { id: string; status: string; startedAt: string; completedAt: string | null };
  };
  summary: {
    totalParameters: number;
    byVerdict: Record<Verdict, number>;
    mustHavePassRate: number;
    goodToHavePassRate: number;
    overallStatus: "compliant" | "partially_compliant" | "non_compliant";
    averageModificationDistance: number;
    deterministicCount: number;
    llmCount: number;
  };
  sections: {
    phase: string;
    importance: string;
    rows: {
      key: string;
      label: string;
      response: string;
      verdict: Verdict;
      rationale: string;
      confidence: number;
      modificationDistance: number;
      evaluatedBy: string;
    }[];
  }[];
};

const PHASE_ORDER = ["general", "must_have", "good_to_have", "subjective"] as const;

function passRate(rows: ReportInput["responses"]): number {
  if (rows.length === 0) return 1;
  const passes = rows.filter((r) => r.verdict === "pass" || r.verdict === "not_applicable").length;
  return passes / rows.length;
}

function deriveOverallStatus(
  responses: ReportInput["responses"],
): ComplianceReportPayload["summary"]["overallStatus"] {
  const mustHave = responses.filter((r) => r.parameter.importance === "must");
  const mustHaveAllPass = mustHave.every(
    (r) => r.verdict === "pass" || r.verdict === "not_applicable",
  );
  if (!mustHaveAllPass) return "non_compliant";
  const anyFail = responses.some((r) => r.verdict === "fail");
  const anyPartial = responses.some((r) => r.verdict === "partial");
  if (anyFail || anyPartial) return "partially_compliant";
  return "compliant";
}

export function buildComplianceReport(input: ReportInput): ComplianceReportPayload {
  const byVerdict: Record<Verdict, number> = { pass: 0, fail: 0, partial: 0, not_applicable: 0 };
  for (const r of input.responses) byVerdict[r.verdict]++;

  const mustHaveResponses = input.responses.filter((r) => r.parameter.importance === "must");
  const goodToHaveResponses = input.responses.filter((r) => r.parameter.importance === "good");

  const sections = PHASE_ORDER.map((phase) => {
    const rows = input.responses.filter((r) => r.parameter.phase === phase);
    if (rows.length === 0) return null;
    return {
      phase,
      importance: rows[0]!.parameter.importance,
      rows: rows.map((r) => ({
        key: r.parameter.key,
        label: r.parameter.label,
        response: r.rawResponse,
        verdict: r.verdict,
        rationale: r.rationale,
        confidence: r.confidence,
        modificationDistance: r.modificationDistance,
        evaluatedBy: r.evaluatedBy,
      })),
    };
  }).filter((s): s is NonNullable<typeof s> => s !== null);

  const totalMod = input.responses.reduce((s, r) => s + r.modificationDistance, 0);
  const avgMod = input.responses.length === 0 ? 0 : totalMod / input.responses.length;

  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    meta: {
      project: input.rfi.project,
      rfi: {
        id: input.rfi.id,
        title: input.rfi.title,
        componentCategory: input.rfi.componentCategory,
      },
      supplier: input.supplier,
      session: {
        id: input.session.id,
        status: input.session.status,
        startedAt: input.session.startedAt.toISOString(),
        completedAt: input.session.completedAt ? input.session.completedAt.toISOString() : null,
      },
    },
    summary: {
      totalParameters: input.responses.length,
      byVerdict,
      mustHavePassRate: passRate(mustHaveResponses),
      goodToHavePassRate: passRate(goodToHaveResponses),
      overallStatus: deriveOverallStatus(input.responses),
      averageModificationDistance: avgMod,
      deterministicCount: input.responses.filter((r) => r.evaluatedBy === "deterministic").length,
      llmCount: input.responses.filter((r) => r.evaluatedBy === "llm").length,
    },
    sections,
  };
}
