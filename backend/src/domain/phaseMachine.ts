import type { Phase } from "./parameter.js";

const PHASE_ORDER: Phase[] = [
  "general",
  "must_have",
  "good_to_have",
  "subjective",
  "completed",
];

const PHASE_TO_IMPORTANCE: Record<Phase, string | null> = {
  general: "general",
  must_have: "must",
  good_to_have: "good",
  subjective: "subjective",
  completed: null,
};

export function importanceForPhase(phase: Phase): string | null {
  return PHASE_TO_IMPORTANCE[phase];
}

export function nextPhase(current: Phase): Phase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx < 0 || idx === PHASE_ORDER.length - 1) return "completed";
  return PHASE_ORDER[idx + 1]!;
}

export type ParameterAnswerSummary = {
  parameterId: string;
  importance: string;
  verdict: "pass" | "fail" | "partial" | "not_applicable";
};

export type AdvanceDecision =
  | { kind: "stay"; reason: string }
  | { kind: "advance"; from: Phase; to: Phase }
  | { kind: "fail_veto"; failedParameterIds: string[] }
  | { kind: "complete" };

export function decideAdvance(
  currentPhase: Phase,
  parametersInPhase: { id: string; importance: string }[],
  answers: ParameterAnswerSummary[],
): AdvanceDecision {
  if (currentPhase === "completed") return { kind: "complete" };

  const expectedIds = new Set(parametersInPhase.map((p) => p.id));
  const answeredIds = new Set(
    answers.filter((a) => expectedIds.has(a.parameterId)).map((a) => a.parameterId),
  );

  if (answeredIds.size < expectedIds.size) {
    const missing = parametersInPhase.length - answeredIds.size;
    return { kind: "stay", reason: `${missing} parameter(s) still pending in this phase` };
  }

  if (currentPhase === "must_have") {
    const failed = answers
      .filter((a) => expectedIds.has(a.parameterId) && a.verdict !== "pass")
      .map((a) => a.parameterId);
    if (failed.length > 0) return { kind: "fail_veto", failedParameterIds: failed };
  }

  const upcoming = nextPhase(currentPhase);
  if (upcoming === "completed") return { kind: "complete" };
  return { kind: "advance", from: currentPhase, to: upcoming };
}
