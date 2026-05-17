import type { ParameterSpec } from "../domain/parameter.js";
import { callLlm, llmAvailable } from "../llm/client.js";

export type CatalogueDocSummary = {
  id: string;
  filename: string;
  excerpt: string | null;
};

export type SupplierAgentInput = {
  parameter: {
    key: string;
    label: string;
    spec: ParameterSpec;
    phase: string;
  };
  supplierName: string;
  /** All active variants with their FULL catalogue spec objects */
  variantSpecs: { productCode: string; params: Record<string, unknown> }[];
  documents: CatalogueDocSummary[];
  question: string;
  recentHistory?: { role: "tml" | "supplier"; content: string }[];
};

export type SupplierGreetingInput = {
  supplierName: string;
  tmlGreeting: string;
};

export type SupplierIntroAckInput = {
  supplierName: string;
  introMessage: string;
};

export type SupplierAgentTurn = {
  text: string;
  citations: { documentId: string; filename: string }[];
  catalogueHit: boolean;
};

const SYSTEM = `You are Anveshak, an Application Engineer representing a supplier in a formal procurement evaluation with Tata Motors Limited (TML).
You are mid-conversation with TML's senior engineer. You represent MULTIPLE product variants and have been answering their questions one by one.

Your job: answer using ONLY the values from the variant specs provided — never estimate, guess, or fabricate.
Your tone is technically knowledgeable, confident, honest, and solution-oriented.

Rules:
- Answer the current question directly and specifically — lead with the data
- Search the provided variant specs carefully to find the relevant value for the parameter being asked about
- If a variant has the value (even under a slightly different key name), use it — do not say "not in catalogue"
- Always cite the exact value with its unit using the variant name: "[ProductCode] has [parameter] of [value]"
- If multiple variants have different values, present them concisely, then note which best meets TML's requirement
- If a variant genuinely does not have ANY related value after careful inspection: note it briefly as "not available for [ProductCode]"
- For must_have phase: state compliance plainly — "[ProductCode] meets / does not meet your requirement of X — its value is Y"
- If a value does NOT meet TML's requirement: admit it clearly, do not spin or hedge
- You may briefly reference a prior answer only if it directly adds useful context
- Keep responses concise and professional — 2–4 sentences

Hard rules:
- NEVER use the word "our" — always refer to variants by their product code or model name
- Zero hallucination — only use values from the provided variant specs
- Never claim compliance without citing the exact spec value
- Do not repeat information already clearly established in the conversation

Output JSON: {"text": "...", "cited": [<documentId>...]}`;

const GREETING_SYSTEM = `You are Anveshak, an Application Engineer representing a supplier on a procurement call with Tata Motors Limited.
TML's engineer has just greeted you to open the call. Respond warmly and professionally (2–3 sentences):
1. Greet them back and introduce yourself and your company
2. Express that you are pleased to be here and looking forward to the discussion
Tone: professional but personable — like the start of a business call. Keep it brief.
Output JSON: {"text": "..."}`;

const INTRO_ACK_SYSTEM = `You are Anveshak, an Application Engineer representing a supplier at the start of a formal procurement evaluation with Tata Motors Limited.
TML's engineer has just opened the session with a project briefing.

Write a brief, professional acknowledgement (2–3 sentences) that:
1. Confirms you have received and understood the project context
2. States that you are ready to proceed with the evaluation
3. Optionally notes the variants you will be presenting (if relevant)

Tone: professional, confident, ready. No filler phrases.
Output JSON: {"text": "..."}`;

export async function supplierGreetingResponse(input: SupplierGreetingInput): Promise<SupplierAgentTurn> {
  const fallback = {
    text: `Good day, Vishwakarma. I am Anveshak, Application Engineer at ${input.supplierName}. Pleased to connect with the Tata Motors team — looking forward to our discussion today.`,
    citations: [],
    catalogueHit: false,
  };
  if (!llmAvailable()) return fallback;

  const raw = await callLlm({
    system: GREETING_SYSTEM,
    user: `Supplier company: ${input.supplierName}\nTML's greeting: ${input.tmlGreeting}`,
    json: true,
    maxTokens: 100,
  });
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as { text?: string };
    return { text: parsed.text?.trim() || fallback.text, citations: [], catalogueHit: false };
  } catch {
    return fallback;
  }
}

export async function supplierIntroAck(input: SupplierIntroAckInput): Promise<SupplierAgentTurn> {
  const fallback = {
    text: `Understood. ${input.supplierName} is ready to proceed with the evaluation. We will present our product variants against TML's requirements as requested.`,
    citations: [],
    catalogueHit: false,
  };

  if (!llmAvailable()) return fallback;

  const userPrompt = [
    `Supplier: ${input.supplierName}`,
    `TML's opening message: ${input.introMessage}`,
    "",
    "Write a brief acknowledgement confirming you are ready to proceed.",
  ].join("\n");

  const raw = await callLlm({ system: INTRO_ACK_SYSTEM, user: userPrompt, json: true, maxTokens: 120 });
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { text?: string };
    return { text: parsed.text?.trim() || fallback.text, citations: [], catalogueHit: false };
  } catch {
    return fallback;
  }
}

export async function supplierAgentTurn(input: SupplierAgentInput): Promise<SupplierAgentTurn> {
  if (!llmAvailable() || input.variantSpecs.length === 0) {
    return {
      text: `I will need to review the engineering specifications for ${input.parameter.label} and revert.`,
      citations: [],
      catalogueHit: false,
    };
  }

  const docContext = input.documents
    .filter((d) => d.excerpt)
    .map((d) => `[doc:${d.id}] ${d.filename}\n${d.excerpt}`)
    .join("\n\n---\n\n");

  // Build a full spec block for each variant (PoC approach: LLM searches the specs itself)
  const variantBlocks = input.variantSpecs
    .map((v) => {
      const specLines = Object.entries(v.params)
        .map(([k, val]) => `  ${k}: ${JSON.stringify(val)}`)
        .join("\n");
      return `=== ${v.productCode} ===\n${specLines}`;
    })
    .join("\n\n");

  const historyBlock = input.recentHistory && input.recentHistory.length > 0
    ? "Recent conversation:\n" + input.recentHistory
        .map((t) => `${t.role === "tml" ? "Vishwakarma (TML)" : "Anveshak (You)"}: ${t.content}`)
        .join("\n") + "\n"
    : "";

  const userPrompt = [
    `Supplier: ${input.supplierName}`,
    `Phase: ${input.parameter.phase}`,
    "",
    historyBlock,
    `TML's current question: ${input.question}`,
    `Parameter being asked: ${input.parameter.label} (key: ${input.parameter.key})`,
    `Specification type: ${input.parameter.spec.type}`,
    "",
    "Full variant catalogue specs:",
    variantBlocks,
    "",
    docContext ? `Catalogue document excerpts:\n${docContext}\n` : "",
    `Find the value for "${input.parameter.label}" in the specs above. Look for keys containing words like "${input.parameter.key.replace(/_/g, " ")}". Answer TML's current question using those exact values. Do NOT use the word "our" — use the product code name instead.`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callLlm({ system: SYSTEM, user: userPrompt, json: true, maxTokens: 220 });

  const fallback = {
    text: `I will need to review the engineering specifications for ${input.parameter.label} and revert.`,
    citations: [],
    catalogueHit: false,
  };

  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { text?: string; cited?: string[] };
    const text = parsed.text?.trim() || fallback.text;
    const cited = Array.isArray(parsed.cited) ? parsed.cited : [];
    const citations = cited
      .map((id) => input.documents.find((d) => d.id === id))
      .filter((d): d is CatalogueDocSummary => Boolean(d))
      .map((d) => ({ documentId: d.id, filename: d.filename }));
    const catalogueHit = !text.toLowerCase().includes("not in catalogue") &&
      !text.toLowerCase().includes("not listed");
    return { text, citations, catalogueHit };
  } catch {
    return fallback;
  }
}
