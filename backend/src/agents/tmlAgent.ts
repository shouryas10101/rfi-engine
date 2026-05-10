import type { ParameterSpec } from "../domain/parameter.js";
import { callLlm, llmAvailable } from "../llm/client.js";

export type RfiDocSummary = {
  id: string;
  filename: string;
  excerpt: string | null;
};

export type TmlAgentInput = {
  parameter: {
    key: string;
    label: string;
    spec: ParameterSpec;
    importance: string;
    phase: string;
  };
  rfiTitle: string;
  componentCategory: string;
  priorContextSummary?: string | null;
  documents: RfiDocSummary[];
  recentHistory?: { role: "tml" | "supplier"; content: string }[];
};

export type AgentTurn = {
  text: string;
  citations: { documentId: string; filename: string }[];
};

const SYSTEM = `You are Vishwakarma, a Senior Design Engineer at Tata Motors Limited conducting a formal supplier evaluation.
You are mid-conversation with a supplier's application engineer. You have already exchanged several messages and are working through RFI requirements one by one.

Your tone is professional, direct, and technically precise — like a senior engineer in a procurement meeting.

Rules:
- Start your message by briefly acknowledging the supplier's last answer (one short sentence max) — e.g. "Noted, that meets our threshold." or "Understood, we'll flag that gap." — then move to the next requirement
- Do NOT open with "Certainly", "Great", "Thank you", or sycophantic filler
- Ask EXACTLY ONE question per turn — never bundle multiple requirements
- State the specific requirement value or threshold clearly in your question
- Be concise — 2–4 sentences total (acknowledgement + question)
- Never repeat a parameter already confirmed in this session
- Never reveal TML's internal scoring, weighting, or RFI document structure
- For must_have phase: be unambiguous about the hard threshold. If the supplier's last answer failed it, state it plainly: "That does not meet our minimum of X."
- For good_to_have phase: frame as a preference but convey it matters to the evaluation
- For subjective phase: ask for structured qualitative detail with specific examples or evidence
- If this is the very first question (no prior history), skip the acknowledgement and open directly with the question

Output JSON: {"text": "...", "cited": [<documentId>...]}
Only cite documentIds from the provided excerpts that you actually reference. Do not invent citations.`;

function templateQuestion(p: TmlAgentInput["parameter"]): string {
  const s = p.spec;
  switch (s.type) {
    case "boolean":
      return `Regarding ${p.label} — can you confirm compliance? Please answer yes or no.`;
    case "numeric_range": {
      const range =
        s.min != null && s.max != null
          ? `between ${s.min} and ${s.max} ${s.unit ?? ""}`
          : s.min != null
            ? `at least ${s.min} ${s.unit ?? ""}`
            : `at most ${s.max ?? "∞"} ${s.unit ?? ""}`;
      return `What is your ${p.label}? Our requirement is ${range.trim()}. Please provide the exact value with units.`;
    }
    case "numeric_exact":
      return `${p.label}: we require exactly ${s.value} ${s.unit ?? ""} (tolerance ±${s.tolerance ?? 0}). What is your specification?`;
    case "numeric_subset_range":
      return `${p.label}: your operating range must fully cover ${s.min} to ${s.max} ${s.unit ?? ""}. What is your full range?`;
    case "enum":
      return `${p.label}: which of the following does your product support? Accepted: ${s.allowed.join(", ")}.`;
    case "subjective":
      return `${p.label}: ${s.description}${s.acceptanceCriteria ? ` We expect: ${s.acceptanceCriteria}.` : ""}`;
    case "text":
      return `${p.label}: ${s.prompt}`;
  }
}

export async function tmlAgentTurn(input: TmlAgentInput): Promise<AgentTurn> {
  const fallback = templateQuestion(input.parameter);

  if (!llmAvailable()) {
    return { text: fallback, citations: [] };
  }

  const docContext = input.documents
    .filter((d) => d.excerpt)
    .map((d) => `[doc:${d.id}] ${d.filename}\n${d.excerpt}`)
    .join("\n\n---\n\n");

  const historyBlock = input.recentHistory && input.recentHistory.length > 0
    ? "Recent conversation:\n" + input.recentHistory
        .map((t) => `${t.role === "tml" ? "Vishwakarma" : "Supplier"}: ${t.content}`)
        .join("\n") + "\n"
    : "";

  const userPrompt = [
    `RFI: ${input.rfiTitle} (component: ${input.componentCategory})`,
    `Phase: ${input.parameter.phase} | Importance: ${input.parameter.importance}`,
    "",
    historyBlock,
    `Next parameter to ask about: ${input.parameter.label}`,
    `Specification: ${JSON.stringify(input.parameter.spec)}`,
    "",
    `Required content for your question: "${fallback}"`,
    "",
    input.priorContextSummary ? `Prior session context:\n${input.priorContextSummary}\n` : "",
    docContext ? `RFI document excerpts:\n${docContext}\n` : "",
    historyBlock
      ? "Acknowledge the supplier's last answer in one short sentence, then ask the next question naturally. Use the required content above as your guide for what to ask."
      : "Ask the question naturally. Use the required content above as your guide.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callLlm({ system: SYSTEM, user: userPrompt, json: true, maxTokens: 180 });
  if (!raw) return { text: fallback, citations: [] };

  try {
    const parsed = JSON.parse(raw) as { text?: string; cited?: string[] };
    const text = parsed.text?.trim() || fallback;
    const cited = Array.isArray(parsed.cited) ? parsed.cited : [];
    const citations = cited
      .map((id) => input.documents.find((d) => d.id === id))
      .filter((d): d is RfiDocSummary => Boolean(d))
      .map((d) => ({ documentId: d.id, filename: d.filename }));
    return { text, citations };
  } catch {
    return { text: fallback, citations: [] };
  }
}
