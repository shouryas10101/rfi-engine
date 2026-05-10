import { z } from "zod";

export const ImportanceSchema = z.enum(["general", "must", "good", "subjective"]);
export type Importance = z.infer<typeof ImportanceSchema>;

export const PhaseSchema = z.enum([
  "general",
  "must_have",
  "good_to_have",
  "subjective",
  "completed",
]);
export type Phase = z.infer<typeof PhaseSchema>;

export const NumericRangeSpecSchema = z.object({
  type: z.literal("numeric_range"),
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  unit: z.string(),
});

export const NumericExactSpecSchema = z.object({
  type: z.literal("numeric_exact"),
  value: z.number(),
  tolerance: z.number().min(0).default(0),
  unit: z.string(),
});

export const NumericSubsetRangeSpecSchema = z.object({
  type: z.literal("numeric_subset_range"),
  min: z.number(),
  max: z.number(),
  unit: z.string(),
});

export const BooleanSpecSchema = z.object({
  type: z.literal("boolean"),
  expected: z.boolean(),
});

export const EnumSpecSchema = z.object({
  type: z.literal("enum"),
  allowed: z.array(z.string()).min(1),
});

export const SubjectiveSpecSchema = z.object({
  type: z.literal("subjective"),
  description: z.string(),
  acceptanceCriteria: z.string().optional(),
});

export const TextSpecSchema = z.object({
  type: z.literal("text"),
  prompt: z.string(),
  acceptanceCriteria: z.string().optional(),
});

export const ParameterSpecSchema = z.discriminatedUnion("type", [
  NumericRangeSpecSchema,
  NumericExactSpecSchema,
  NumericSubsetRangeSpecSchema,
  BooleanSpecSchema,
  EnumSpecSchema,
  SubjectiveSpecSchema,
  TextSpecSchema,
]);
export type ParameterSpec = z.infer<typeof ParameterSpecSchema>;

export const ParameterDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  label: z.string(),
  phase: PhaseSchema,
  importance: ImportanceSchema,
  spec: ParameterSpecSchema,
  weight: z.number().positive().default(1),
  ordering: z.number().int().nonnegative(),
});
export type ParameterDefinition = z.infer<typeof ParameterDefinitionSchema>;

export const VerdictSchema = z.enum(["pass", "fail", "partial", "not_applicable"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export type EvaluationResult = {
  verdict: Verdict;
  confidence: number;
  rationale: string;
  parsedValue: unknown;
  modificationDistance: number;
  evaluatedBy: "deterministic" | "llm" | "none";
};

export const SupplierResponseSchema = z.object({
  parameterId: z.string(),
  rawResponse: z.string().min(1),
  structuredValue: z.unknown().optional(),
});
export type SupplierResponse = z.infer<typeof SupplierResponseSchema>;
