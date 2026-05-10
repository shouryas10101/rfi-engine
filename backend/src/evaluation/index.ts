import { evaluateDeterministic } from "./deterministic.js";
import { evaluateLLM } from "./llm.js";
import type { EvaluationResult, ParameterSpec } from "../domain/parameter.js";

export async function evaluate(
  raw: string,
  spec: ParameterSpec,
  label: string,
): Promise<EvaluationResult> {
  const det = evaluateDeterministic(raw, spec);
  if (det) return det;
  return evaluateLLM(
    raw,
    spec as Extract<ParameterSpec, { type: "subjective" } | { type: "text" }>,
    label,
  );
}
