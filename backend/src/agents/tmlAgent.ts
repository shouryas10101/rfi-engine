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

export type TmlGreetingInput = {
  supplierName: string;
  componentCategory: string;
};

export type TmlIntroInput = {
  rfiTitle: string;
  componentCategory: string;
  project: {
    name: string;
    vehicleType: string;
    targetMarket: string | null;
    sop: string | null;
  };
  documents: RfiDocSummary[];
};

export type TmlAckInput = {
  lastSupplierAnswer: string;
  parameter: { label: string; spec: ParameterSpec; importance: string; phase: string };
};

export type AgentTurn = {
  text: string;
  citations: { documentId: string; filename: string }[];
};

// ── Greeting system ──────────────────────────────────────────────────────────

const GREETING_SYSTEM = `You are Vishwakarma, a Senior Design Engineer at Tata Motors Limited.
You are opening a procurement call with a supplier's engineer. Write a brief, warm professional greeting (2–3 sentences) that:
1. Opens with a time-appropriate salutation (use the time of day provided — good morning / good afternoon / good evening)
2. Introduces yourself by name and company
3. Expresses that you are glad to connect and looking forward to the discussion on the component area

Tone: professional but personable — like the opening of a business call. No filler like "Hope you're doing well."
Output JSON: {"text": "..."}`;

function getTimeOfDay(): string {
  // Use IST (UTC+5:30) since this is a Tata Motors context
  const nowUtc = Date.now();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istHour = new Date(nowUtc + istOffsetMs).getUTCHours();
  if (istHour < 12) return "morning";
  if (istHour < 17) return "afternoon";
  return "evening";
}

// ── Intro system ─────────────────────────────────────────────────────────────

const INTRO_SYSTEM = `You are Vishwakarma, a Senior Design Engineer at Tata Motors Limited opening a formal supplier evaluation session.

Your task: Write a brief professional opening message that:
1. Greets the supplier engineer formally
2. States the vehicle programme, component being evaluated, and target market / SOP if known
3. Notes the purpose of this session (evaluating the supplier's product against TML's technical requirements)
4. Invites the supplier to confirm they are ready to proceed

Tone: formal, direct, professional. Length: 3–5 sentences. No filler phrases.
Do NOT ask any technical requirement question yet.

Output JSON: {"text": "..."}`;

// ── Acknowledgement system ────────────────────────────────────────────────────

const ACK_SYSTEM = `You are Vishwakarma, a Senior Design Engineer at Tata Motors Limited in a supplier evaluation session.
The supplier has just answered a technical question. Write a natural, varied one-sentence acknowledgement.

Rules:
- React to whether the answer meets, does not meet, or is inconclusive against the stated specification
- Vary your phrasing — do not default to "Noted." every time. Use natural engineer language:
  - Meets spec: "That's within our range.", "That clears our threshold.", "Good, that's aligned with our requirement.", "That works for us.", "That satisfies our specification."
  - Does not meet: "That falls short of our minimum of X — we will record that gap.", "That's below the threshold we need, so we'll flag it.", "That doesn't meet our requirement of X."
  - Inconclusive / partial: "Understood, we'll review that in detail.", "That's on the boundary — we'll assess it further.", "We'll take that under consideration."
- One sentence only — no follow-up questions, no padding
- Do NOT use sycophantic phrases like "Thank you", "Great", "Excellent", "Absolutely"
- Do NOT start with "Noted" more than once in every five turns — it becomes repetitive

Output JSON: {"text": "..."}`;

// ── Question system ───────────────────────────────────────────────────────────

const QUESTION_SYSTEM = `You are Vishwakarma, a Senior Design Engineer at Tata Motors Limited conducting a formal supplier evaluation.
You are mid-conversation with a supplier's application engineer, working through RFI requirements one by one.

Your tone is professional, direct, and technically precise — like a senior engineer in a procurement meeting.

Rules:
- Ask EXACTLY ONE question per turn — never bundle multiple requirements
- State the specific requirement value or threshold clearly in your question
- Be concise — 2–3 sentences maximum
- Do NOT open with "Certainly", "Great", "Thank you", or any acknowledgement — a separate acknowledgement message has already been sent
- Do NOT include any acknowledgement of the previous answer in this message — jump straight to the question
- Never repeat a parameter already confirmed in this session
- Never reveal TML's internal scoring, weighting, or RFI document structure
- For must_have phase: be unambiguous about the hard threshold
- For good_to_have phase: frame as a preference but convey it matters to the evaluation
- For subjective phase: ask for structured qualitative detail with specific examples or evidence

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

// ── Exported functions ────────────────────────────────────────────────────────

export async function tmlGreetingTurn(input: TmlGreetingInput): Promise<AgentTurn> {
  const tod = getTimeOfDay();
  const todLabel = `Good ${tod}`;
  const fallback = `${todLabel}. I am Vishwakarma, Senior Design Engineer at Tata Motors Limited. I am glad to connect with the ${input.supplierName} team and look forward to our discussion on ${input.componentCategory} today.`;
  if (!llmAvailable()) return { text: fallback, citations: [] };

  const raw = await callLlm({
    system: GREETING_SYSTEM,
    user: `Time of day: ${tod}\nSupplier company: ${input.supplierName}\nComponent area: ${input.componentCategory}`,
    json: true,
    maxTokens: 100,
  });
  if (!raw) return { text: fallback, citations: [] };
  try {
    const parsed = JSON.parse(raw) as { text?: string };
    return { text: parsed.text?.trim() || fallback, citations: [] };
  } catch {
    return { text: fallback, citations: [] };
  }
}

export async function tmlIntroTurn(input: TmlIntroInput): Promise<AgentTurn> {
  const sopYear = input.project.sop
    ? new Date(input.project.sop).getFullYear()
    : null;
  const fallback =
    `Good day. I am Vishwakarma from Tata Motors, and I will be conducting today's RFI evaluation for the ${input.rfiTitle} requirement on our ${input.project.vehicleType} programme` +
    (input.project.targetMarket ? ` for the ${input.project.targetMarket} market` : "") +
    (sopYear ? `, with SOP targeted for ${sopYear}` : "") +
    `. The purpose of this session is to assess your product range against our technical specifications for ${input.componentCategory}. Please confirm you are ready to proceed.`;

  if (!llmAvailable()) return { text: fallback, citations: [] };

  const projectBlock = [
    `Project name: ${input.project.name}`,
    `Vehicle type: ${input.project.vehicleType}`,
    input.project.targetMarket ? `Target market: ${input.project.targetMarket}` : null,
    sopYear ? `SOP: ${sopYear}` : null,
    `Component category: ${input.componentCategory}`,
    `RFI title: ${input.rfiTitle}`,
  ].filter(Boolean).join("\n");

  const docContext = input.documents
    .filter((d) => d.excerpt)
    .map((d) => `[doc:${d.id}] ${d.filename}\n${d.excerpt}`)
    .join("\n\n---\n\n");

  const userPrompt = [
    "Write the opening message for this evaluation session using the project details below.",
    "",
    projectBlock,
    "",
    docContext ? `RFI document excerpts (use any relevant project context from these):\n${docContext}` : "",
  ].filter(Boolean).join("\n");

  const raw = await callLlm({ system: INTRO_SYSTEM, user: userPrompt, json: true, maxTokens: 220 });
  if (!raw) return { text: fallback, citations: [] };

  try {
    const parsed = JSON.parse(raw) as { text?: string };
    return { text: parsed.text?.trim() || fallback, citations: [] };
  } catch {
    return { text: fallback, citations: [] };
  }
}

export async function tmlAcknowledgementTurn(input: TmlAckInput): Promise<AgentTurn> {
  const fallback = "Noted.";
  if (!llmAvailable()) return { text: fallback, citations: [] };

  const userPrompt = [
    `Parameter just answered: ${input.parameter.label}`,
    `Phase: ${input.parameter.phase} | Importance: ${input.parameter.importance}`,
    `Specification: ${JSON.stringify(input.parameter.spec)}`,
    `Supplier's answer: ${input.lastSupplierAnswer}`,
    "",
    "Write a one-sentence acknowledgement only.",
  ].join("\n");

  const raw = await callLlm({ system: ACK_SYSTEM, user: userPrompt, json: true, maxTokens: 80 });
  if (!raw) return { text: fallback, citations: [] };

  try {
    const parsed = JSON.parse(raw) as { text?: string };
    return { text: parsed.text?.trim() || fallback, citations: [] };
  } catch {
    return { text: fallback, citations: [] };
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
    "Ask the question directly — no acknowledgement of prior answers, jump straight to the question.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callLlm({ system: QUESTION_SYSTEM, user: userPrompt, json: true, maxTokens: 180 });
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
