import { z } from "zod";
import { callLlm, llmAvailable } from "../llm/client.js";
import type { EvaluationResult, ParameterSpec } from "../domain/parameter.js";

const LlmVerdictSchema = z.object({
  verdict: z.enum(["pass", "fail", "partial", "not_applicable"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(500),
  modificationDistance: z.number().min(0).max(1),
});

const SYSTEM_PROMPT = `You are a strict technical compliance evaluator for automotive component RFIs.

Your job: given ONE RFI requirement and ONE supplier response, decide whether the supplier
satisfies that single requirement. You evaluate ONLY this one parameter — ignore anything else.

Use engineering knowledge and common sense. Examples of correct reasoning:
- Required "eAxle or Integrated eAxle", offered "Central Drive Unit" → FAIL (different architecture)
- Required "eAxle or Integrated eAxle", offered "Hub Motor" → FAIL (hub motor is not an eAxle)
- Required "Liquid/water cooling", offered "Water-Glycol (50-50)" → PASS (glycol IS liquid cooling)
- Required "Liquid/water cooling", offered "Forced Air" → FAIL (not liquid cooling)
- Required "PMSM", offered "Permanent Magnet Synchronous Motor" → PASS (same thing)
- Required "ASIL-C", offered "ASIL-B" → FAIL (lower safety level)

Output JSON ONLY, matching this exact schema:
{
  "verdict": "pass" | "fail" | "partial" | "not_applicable",
  "confidence": 0.0 to 1.0,
  "rationale": "1 sentence explaining the verdict",
  "modificationDistance": 0.0 to 1.0
}

Verdict semantics:
- pass: response clearly meets the requirement
- partial: response addresses the requirement but with minor gap or ambiguity
- fail: response does not meet the requirement
- not_applicable: requirement does not apply to this product class

modificationDistance: how much engineering rework is needed (0 = none, 1 = fundamental redesign).`;

function buildUserPrompt(
  spec: Extract<ParameterSpec, { type: "subjective" } | { type: "text" }>,
  label: string,
  raw: string,
): string {
  if (spec.type === "subjective") {
    return [
      `RFI parameter: ${label}`,
      `Description: ${spec.description}`,
      spec.acceptanceCriteria ? `Acceptance criteria: ${spec.acceptanceCriteria}` : null,
      `\nSupplier response:\n${raw}`,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    `RFI parameter: ${label}`,
    spec.acceptanceCriteria ? `Required value: ${spec.acceptanceCriteria}` : `Prompt: ${spec.prompt}`,
    `\nSupplier offered value:\n${raw}`,
  ].join("\n");
}

export async function evaluateLLM(
  raw: string,
  spec: Extract<ParameterSpec, { type: "subjective" } | { type: "text" }>,
  label: string,
): Promise<EvaluationResult> {
  if (!llmAvailable()) {
    return {
      verdict: "partial",
      confidence: 0.4,
      rationale:
        "LLM evaluator not configured (OPENAI_API_KEY missing). Recorded supplier response for manual review.",
      parsedValue: { raw },
      modificationDistance: 0.5,
      evaluatedBy: "none",
    };
  }

  const content = await callLlm({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(spec, label, raw),
    json: true,
    maxTokens: 180,
  });

  if (!content) {
    return {
      verdict: "partial",
      confidence: 0.3,
      rationale: "LLM evaluation failed; response recorded for manual review.",
      parsedValue: { raw },
      modificationDistance: 0.5,
      evaluatedBy: "none",
    };
  }

  try {
    const parsed = LlmVerdictSchema.parse(JSON.parse(content));
    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      rationale: parsed.rationale,
      parsedValue: { raw },
      modificationDistance: parsed.modificationDistance,
      evaluatedBy: "llm",
    };
  } catch {
    return {
      verdict: "partial",
      confidence: 0.3,
      rationale: "LLM evaluation produced invalid output; response recorded for manual review.",
      parsedValue: { raw },
      modificationDistance: 0.5,
      evaluatedBy: "none",
    };
  }
}
