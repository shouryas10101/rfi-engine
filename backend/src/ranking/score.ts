import type { Verdict } from "../domain/parameter.js";

export type SupplierEvaluation = {
  supplierId: string;
  supplierName: string;
  sessionId: string;
  status: "active" | "completed" | "failed_veto" | "abandoned";
  responses: {
    parameterId: string;
    importance: string;
    weight: number;
    verdict: Verdict;
    confidence: number;
    modificationDistance: number;
  }[];
};

export type RankedSupplier = {
  supplierId: string;
  supplierName: string;
  sessionId: string;
  status: SupplierEvaluation["status"];
  rank: number;
  totalScore: number;
  components: {
    mustHavePassRate: number;
    goodToHaveScore: number;
    subjectiveScore: number;
    avgModificationDistance: number;
  };
  eligible: boolean;
  rationale: string;
};

const WEIGHTS = {
  mustHave: 0.5,
  goodToHave: 0.25,
  subjective: 0.15,
  modificationPenalty: 0.1,
};

function verdictScore(v: Verdict): number {
  switch (v) {
    case "pass":
      return 1;
    case "partial":
      return 0.5;
    case "not_applicable":
      return 1;
    case "fail":
      return 0;
  }
}

function weightedScore(
  responses: SupplierEvaluation["responses"],
  importance: string,
): number {
  const subset = responses.filter((r) => r.importance === importance);
  if (subset.length === 0) return 1;
  const totalWeight = subset.reduce((s, r) => s + r.weight, 0);
  if (totalWeight === 0) return 1;
  const weighted = subset.reduce((s, r) => s + r.weight * verdictScore(r.verdict), 0);
  return weighted / totalWeight;
}

function avgModification(responses: SupplierEvaluation["responses"]): number {
  if (responses.length === 0) return 0;
  return responses.reduce((s, r) => s + r.modificationDistance, 0) / responses.length;
}

function buildRationale(s: RankedSupplier): string {
  if (!s.eligible) {
    return "Failed one or more must-have requirements; ineligible regardless of other scores.";
  }
  const parts: string[] = [];
  parts.push(`Must-have pass rate ${(s.components.mustHavePassRate * 100).toFixed(0)}%`);
  parts.push(`good-to-have ${(s.components.goodToHaveScore * 100).toFixed(0)}%`);
  parts.push(`subjective ${(s.components.subjectiveScore * 100).toFixed(0)}%`);
  parts.push(`avg modification ${(s.components.avgModificationDistance * 100).toFixed(0)}%`);
  return parts.join(", ") + ".";
}

export function rankSuppliers(suppliers: SupplierEvaluation[]): RankedSupplier[] {
  const ranked: RankedSupplier[] = suppliers.map((s) => {
    const mustHavePassRate = weightedScore(s.responses, "must");
    const goodToHaveScore = weightedScore(s.responses, "good");
    const subjectiveScore = weightedScore(s.responses, "subjective");
    const avgMod = avgModification(s.responses);

    const eligible =
      s.status !== "failed_veto" &&
      s.responses
        .filter((r) => r.importance === "must")
        .every((r) => r.verdict === "pass" || r.verdict === "not_applicable");

    const totalScore = eligible
      ? WEIGHTS.mustHave * mustHavePassRate +
        WEIGHTS.goodToHave * goodToHaveScore +
        WEIGHTS.subjective * subjectiveScore -
        WEIGHTS.modificationPenalty * avgMod
      : 0;

    const partial: RankedSupplier = {
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      sessionId: s.sessionId,
      status: s.status,
      rank: 0,
      totalScore: Math.max(0, totalScore),
      components: {
        mustHavePassRate,
        goodToHaveScore,
        subjectiveScore,
        avgModificationDistance: avgMod,
      },
      eligible,
      rationale: "",
    };
    partial.rationale = buildRationale(partial);
    return partial;
  });

  ranked.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    return b.totalScore - a.totalScore;
  });
  ranked.forEach((s, i) => {
    s.rank = i + 1;
  });
  return ranked;
}
