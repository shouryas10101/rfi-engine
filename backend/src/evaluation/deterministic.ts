import type { EvaluationResult, ParameterSpec } from "../domain/parameter.js";

const NUMBER_RX = /-?\d+(?:\.\d+)?/g;

function extractNumbers(s: string): number[] {
  const matches = s.match(NUMBER_RX);
  return matches ? matches.map(Number).filter((n) => Number.isFinite(n)) : [];
}

function extractBoolean(s: string): boolean | null {
  const t = s.trim().toLowerCase();
  if (/^(yes|true|y|present|supported|available|complies|compliant)\b/.test(t)) return true;
  if (/^(no|false|n|absent|unsupported|unavailable|non[- ]compliant)\b/.test(t)) return false;
  return null;
}

function withinTolerance(actual: number, target: number, tolerance: number): boolean {
  return Math.abs(actual - target) <= tolerance;
}

function modificationDistanceFromRange(
  value: number,
  min: number | null | undefined,
  max: number | null | undefined,
): number {
  if (min != null && value < min) return Math.min(1, (min - value) / Math.max(Math.abs(min), 1));
  if (max != null && value > max) return Math.min(1, (value - max) / Math.max(Math.abs(max), 1));
  return 0;
}

export function evaluateNumericRange(
  raw: string,
  spec: Extract<ParameterSpec, { type: "numeric_range" }>,
): EvaluationResult {
  const nums = extractNumbers(raw);
  if (nums.length === 0) {
    return {
      verdict: "partial",
      confidence: 0.3,
      rationale: `Could not extract a numeric value from response "${raw}"`,
      parsedValue: null,
      modificationDistance: 1,
      evaluatedBy: "deterministic",
    };
  }
  const value = nums[0]!;
  const { min, max, unit } = spec;
  const inRange =
    (min == null || value >= min) && (max == null || value <= max);
  return {
    verdict: inRange ? "pass" : "fail",
    confidence: 1,
    rationale: inRange
      ? `Value ${value} ${unit} is within required range [${min ?? "-∞"}, ${max ?? "∞"}] ${unit}`
      : `Value ${value} ${unit} falls outside required range [${min ?? "-∞"}, ${max ?? "∞"}] ${unit}`,
    parsedValue: { value, unit },
    modificationDistance: modificationDistanceFromRange(value, min, max),
    evaluatedBy: "deterministic",
  };
}

export function evaluateNumericExact(
  raw: string,
  spec: Extract<ParameterSpec, { type: "numeric_exact" }>,
): EvaluationResult {
  const nums = extractNumbers(raw);
  if (nums.length === 0) {
    return {
      verdict: "partial",
      confidence: 0.3,
      rationale: `Could not extract a numeric value from response "${raw}"`,
      parsedValue: null,
      modificationDistance: 1,
      evaluatedBy: "deterministic",
    };
  }
  const value = nums[0]!;
  const ok = withinTolerance(value, spec.value, spec.tolerance ?? 0);
  const dist = Math.min(
    1,
    Math.abs(value - spec.value) / Math.max(Math.abs(spec.value), 1),
  );
  return {
    verdict: ok ? "pass" : "fail",
    confidence: 1,
    rationale: ok
      ? `Value ${value} ${spec.unit} matches required ${spec.value} ${spec.unit} within tolerance ±${spec.tolerance}`
      : `Value ${value} ${spec.unit} differs from required ${spec.value} ${spec.unit} beyond tolerance ±${spec.tolerance}`,
    parsedValue: { value, unit: spec.unit },
    modificationDistance: dist,
    evaluatedBy: "deterministic",
  };
}

/**
 * Subset-range check: supplier's offered range [s_min, s_max] must lie WITHIN the RFI's
 * required range [rfi_min, rfi_max]. This is the right interpretation when the RFI says
 * "the part shall operate over at least this temperature/pressure/load envelope" — the
 * supplier's narrower range is acceptable only if it covers the whole RFI envelope.
 *
 * Rationale: a supplier whose pump operates 20-80 bar cannot satisfy an RFI that requires
 * 10-100 bar, even though the ranges overlap.
 */
export function evaluateNumericSubsetRange(
  raw: string,
  spec: Extract<ParameterSpec, { type: "numeric_subset_range" }>,
): EvaluationResult {
  const nums = extractNumbers(raw);
  if (nums.length < 2) {
    return {
      verdict: "partial",
      confidence: 0.3,
      rationale: `Expected two numeric values (min and max). Extracted ${nums.length} from "${raw}"`,
      parsedValue: nums.length === 1 ? { single: nums[0] } : null,
      modificationDistance: 1,
      evaluatedBy: "deterministic",
    };
  }
  const sorted = [...nums].sort((a, b) => a - b);
  const sMin = sorted[0]!;
  const sMax = sorted[sorted.length - 1]!;
  const covers = sMin <= spec.min && sMax >= spec.max;
  const undershoot = Math.max(0, spec.min - sMin === 0 ? 0 : sMin - spec.min);
  const overshoot = Math.max(0, spec.max - sMax);
  const span = Math.max(spec.max - spec.min, 1);
  const dist = Math.min(1, (Math.max(0, undershoot) + Math.max(0, overshoot)) / span);

  return {
    verdict: covers ? "pass" : "fail",
    confidence: 1,
    rationale: covers
      ? `Supplier range [${sMin}, ${sMax}] ${spec.unit} fully covers required [${spec.min}, ${spec.max}] ${spec.unit}`
      : `Supplier range [${sMin}, ${sMax}] ${spec.unit} does not fully cover required [${spec.min}, ${spec.max}] ${spec.unit}`,
    parsedValue: { offeredMin: sMin, offeredMax: sMax, unit: spec.unit },
    modificationDistance: dist,
    evaluatedBy: "deterministic",
  };
}

export function evaluateBoolean(
  raw: string,
  spec: Extract<ParameterSpec, { type: "boolean" }>,
): EvaluationResult {
  const parsed = extractBoolean(raw);
  if (parsed === null) {
    return {
      verdict: "partial",
      confidence: 0.3,
      rationale: `Could not interpret response "${raw}" as yes/no`,
      parsedValue: null,
      modificationDistance: 1,
      evaluatedBy: "deterministic",
    };
  }
  const ok = parsed === spec.expected;
  return {
    verdict: ok ? "pass" : "fail",
    confidence: 1,
    rationale: ok
      ? `Response is ${parsed}, matching required ${spec.expected}`
      : `Response is ${parsed}, expected ${spec.expected}`,
    parsedValue: parsed,
    modificationDistance: ok ? 0 : 1,
    evaluatedBy: "deterministic",
  };
}

export function evaluateEnum(
  raw: string,
  spec: Extract<ParameterSpec, { type: "enum" }>,
): EvaluationResult {
  const lc = raw.toLowerCase();
  const match = spec.allowed.find((v) => lc.includes(v.toLowerCase()));
  if (match) {
    return {
      verdict: "pass",
      confidence: 1,
      rationale: `Response contains allowed value "${match}"`,
      parsedValue: match,
      modificationDistance: 0,
      evaluatedBy: "deterministic",
    };
  }
  return {
    verdict: "fail",
    confidence: 1,
    rationale: `Response "${raw}" matches none of the allowed values: ${spec.allowed.join(", ")}`,
    parsedValue: null,
    modificationDistance: 1,
    evaluatedBy: "deterministic",
  };
}

export function evaluateDeterministic(
  raw: string,
  spec: ParameterSpec,
): EvaluationResult | null {
  switch (spec.type) {
    case "numeric_range":
      return evaluateNumericRange(raw, spec);
    case "numeric_exact":
      return evaluateNumericExact(raw, spec);
    case "numeric_subset_range":
      return evaluateNumericSubsetRange(raw, spec);
    case "boolean":
      return evaluateBoolean(raw, spec);
    case "enum":
      return evaluateEnum(raw, spec);
    case "subjective":
    case "text":
      return null;
  }
}
