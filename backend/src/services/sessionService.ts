import { prisma } from "../db/client.js";
import { evaluate } from "../evaluation/index.js";
import { evaluateDeterministic } from "../evaluation/deterministic.js";
import { evaluateLLM } from "../evaluation/llm.js";
import {
  decideAdvance,
  importanceForPhase,
  type ParameterAnswerSummary,
} from "../domain/phaseMachine.js";
import { ParameterSpecSchema, type Phase, type ParameterSpec } from "../domain/parameter.js";
import { buildComplianceReport, type VariantStatus } from "../compliance/report.js";
import { tmlAgentTurn, tmlGreetingTurn, tmlIntroTurn, tmlAcknowledgementTurn } from "../agents/tmlAgent.js";
import { supplierAgentTurn, supplierGreetingResponse, supplierIntroAck } from "../agents/supplierAgent.js";
import { getPriorContextForSession } from "./contextService.js";
import type { Document, RFIParameter } from "@prisma/client";


/** Format a raw catalogue value into a string the deterministic evaluator can parse. */
function formatForEval(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value) && value.length === 2) return `${value[0]} ${value[1]}`;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

/**
 * Deterministically check a single catalogue value against a spec.
 * Returns "pass" | "fail" | "inconclusive" (inconclusive = not enough info to eliminate).
 */
function checkVariantValue(value: unknown, spec: ParameterSpec): "pass" | "fail" | "inconclusive" {
  if (value === undefined || value === null) return "inconclusive";
  const raw = formatForEval(value);
  const result = evaluateDeterministic(raw, spec);
  if (!result) return "inconclusive"; // subjective/text — can't determine
  if (result.verdict === "fail") return "fail";
  if (result.verdict === "pass") return "pass";
  return "inconclusive";
}

/**
 * Count how many GTH parameters a variant passed, from stored GTH system turns.
 * Format: "GTH_PASS — {productCode}: "{label}"" or "GTH_FAIL — ..."
 */
function computeGthMatched(
  productCode: string,
  turns: { content: string }[],
): number {
  let count = 0;
  for (const t of turns) {
    if (t.content.startsWith(`GTH_PASS — ${productCode}: `)) count++;
  }
  return count;
}

/**
 * Parse ELIM system turns to extract text-type (LLM-evaluated) eliminations.
 * Format: "ELIM — {productCode}: failed "{paramLabel}" — {reason}"
 */
function extractElimFromTurns(
  turns: { content: string }[],
): Record<string, { eliminatedAt: string; eliminationReason: string }> {
  const result: Record<string, { eliminatedAt: string; eliminationReason: string }> = {};
  for (const t of turns) {
    const m = t.content.match(/^ELIM — ([^:]+): failed "([^"]+)" — (.+)$/);
    if (m) {
      const [, productCode, paramLabel, reason] = m;
      if (!result[productCode!]) {
        result[productCode!] = { eliminatedAt: paramLabel!, eliminationReason: reason! };
      }
    }
  }
  return result;
}

/**
 * Compute per-variant elimination status from must_have responses already stored.
 * Numeric specs are re-evaluated deterministically from catalogue values.
 * Text specs (LLM-evaluated) are read from stored ELIM system turns.
 */
function computeEliminated(
  catalogueItems: { productCode: string; parameters: unknown }[],
  mhResponses: { parameter: { key: string; label: string; spec: unknown } }[],
  elimTurns: { content: string }[] = [],
): Record<string, { eliminatedAt: string; eliminationReason: string }> {
  // Start with text-type eliminations already stored as ELIM turns
  const eliminated = extractElimFromTurns(elimTurns);

  for (const resp of mhResponses) {
    let spec: ParameterSpec;
    try { spec = ParameterSpecSchema.parse(resp.parameter.spec); } catch { continue; }
    // Text type: handled via ELIM turns above (LLM evaluated at step time)
    if (spec.type === "text" || spec.type === "subjective") continue;
    for (const item of catalogueItems) {
      if (eliminated[item.productCode]) continue;
      const val = findCatalogueValue(
        item.parameters as Record<string, unknown>,
        resp.parameter.key,
        resp.parameter.label,
      );
      if (val === undefined) continue;
      const raw = formatForEval(val);
      const det = evaluateDeterministic(raw, spec);
      if (det?.verdict === "fail") {
        eliminated[item.productCode] = {
          eliminatedAt: resp.parameter.label,
          eliminationReason: det.rationale,
        };
      }
    }
  }
  return eliminated;
}

const DOC_EXCERPT_LEN = 1500;

function excerpt(text: string | null): string | null {
  if (!text) return null;
  return text.length > DOC_EXCERPT_LEN ? `${text.slice(0, DOC_EXCERPT_LEN)}...` : text;
}

/**
 * Fuzzy catalogue value lookup — mirrors the PoC's findSpec logic.
 * Three-tier: exact normalised match → substring containment → 3-char token overlap.
 */
function findCatalogueValue(
  params: Record<string, unknown>,
  key: string,
  label: string,
): unknown {
  const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  const nKey = norm(key);
  const nLabel = norm(label);

  // 1. Exact normalised match
  for (const [k, v] of Object.entries(params)) {
    const nk = norm(k);
    if (nk === nKey || nk === nLabel) return v;
  }

  // 2. Substring containment
  for (const [k, v] of Object.entries(params)) {
    const nk = norm(k);
    if (nk.includes(nKey) || nKey.includes(nk)) return v;
    if (nk.includes(nLabel) || nLabel.includes(nk)) return v;
  }

  // 3. Token overlap (at least one 3-char token shared)
  const tokens = [...new Set([...(nKey.match(/[a-z0-9]{3,}/g) ?? []), ...(nLabel.match(/[a-z0-9]{3,}/g) ?? [])])];
  for (const [k, v] of Object.entries(params)) {
    const kToks = norm(k).match(/[a-z0-9]{3,}/g) ?? [];
    if (tokens.some((t) => kToks.some((kt) => kt.includes(t) || t.includes(kt)))) return v;
  }

  return undefined;
}

function pickPendingParameter(
  allParams: RFIParameter[],
  answeredIds: Set<string>,
  phase: Phase,
): RFIParameter | null {
  if (phase === "completed") return null;
  return (
    allParams.find((p) => p.phase === phase && !answeredIds.has(p.id)) ?? null
  );
}

export async function startSession(sessionId: string, tenantId: string): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, supplier: { tenantId } },
  });
  if (!session) throw new Error("session_not_found");
  if (session.status !== "pending" && session.status !== "paused") {
    throw new Error(`cannot_start_session_in_status_${session.status}`);
  }
  await prisma.session.update({
    where: { id: sessionId },
    data: {
      status: "active",
      activatedAt: session.activatedAt ?? new Date(),
    },
  });
  await prisma.turn.create({
    data: {
      sessionId,
      authorRole: "system",
      content:
        session.status === "pending"
          ? "Session started. Agents are now live."
          : "Session resumed.",
    },
  });
}

export async function pauseSession(sessionId: string, tenantId: string): Promise<void> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, supplier: { tenantId } },
  });
  if (!session) throw new Error("session_not_found");
  if (session.status !== "active") throw new Error("session_not_active");
  await prisma.session.update({ where: { id: sessionId }, data: { status: "paused" } });
  await prisma.turn.create({
    data: { sessionId, authorRole: "system", content: "Session paused. Agents will not generate new turns." },
  });
}

/**
 * Advance one TML question + supplier reply pair, evaluate, persist, and update phase.
 * Returns true if a turn pair was generated, false if nothing more to do (session done or paused).
 */
export async function runOneStep(sessionId: string, tenantId: string): Promise<boolean> {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, supplier: { tenantId } },
    include: {
      rfi: {
        include: {
          project: true,
          parameters: { orderBy: [{ phase: "asc" }, { ordering: "asc" }] },
          documents: true,
        },
      },
      supplier: true,
      responses: true,
    },
  });
  if (!session) throw new Error("session_not_found");
  if (session.status !== "active") { console.log(`[runOneStep] early exit: status=${session.status}`); return false; }

  const answeredIds = new Set(session.responses.map((r) => r.parameterId));
  const phase = session.currentPhase as Phase;
  const phaseImportance = importanceForPhase(phase);
  if (!phaseImportance) { console.log(`[runOneStep] early exit: phase=${phase} has no importance`); return false; }

  let pending = pickPendingParameter(session.rfi.parameters, answeredIds, phase);
  if (!pending) {
    // Phase has no parameters (or all answered) — advance and let caller retry
    await advancePhaseIfNeeded(sessionId);
    const after = await prisma.session.findUnique({ where: { id: sessionId }, select: { currentPhase: true } });
    if (after?.currentPhase !== phase) return true; // phase advanced, runUntilBlocked will retry
    return false; // truly stuck
  }

  // Get ALL catalogue variants for this supplier+component (case-insensitive category match)
  const allCatalogueItems = await prisma.catalogueItem.findMany({
    where: { supplierId: session.supplierId },
    include: { documents: true },
  });
  const normCat = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
  const targetCat = normCat(session.rfi.componentCategory);
  const catalogueItems = allCatalogueItems.filter((item) => {
    const itemCat = normCat(item.componentCategory);
    return itemCat === targetCat || itemCat.includes(targetCat) || targetCat.includes(itemCat);
  });

  const rfiDocs = session.rfi.documents.map(toDocSummary);
  const catalogueDocs = catalogueItems.flatMap((item) => item.documents).map(toDocSummary);

  const prior = await getPriorContextForSession(
    session.supplierId,
    session.rfi.componentCategory,
    session.id,
  );

  // ── Greeting exchange (step 0) ───────────────────────────────────────────
  const priorTmlTurnCount = await prisma.turn.count({
    where: { sessionId, authorRole: "tml_agent" },
  });

  if (priorTmlTurnCount === 0) {
    const greeting = await tmlGreetingTurn({
      supplierName: session.supplier.name,
      componentCategory: session.rfi.componentCategory,
    });
    await prisma.turn.create({
      data: { sessionId, authorRole: "tml_agent", content: greeting.text },
    });
    const supplierGreeting = await supplierGreetingResponse({
      supplierName: session.supplier.name,
      tmlGreeting: greeting.text,
    });
    await prisma.turn.create({
      data: { sessionId, authorRole: "supplier_agent", content: supplierGreeting.text },
    });
    return true;
  }

  // ── Project intro exchange (step 1) ─────────────────────────────────────
  if (priorTmlTurnCount === 1) {
    const introTurn = await tmlIntroTurn({
      rfiTitle: session.rfi.title,
      componentCategory: session.rfi.componentCategory,
      project: {
        name: session.rfi.project.name,
        vehicleType: session.rfi.project.vehicleType,
        targetMarket: session.rfi.project.targetMarket,
        sop: session.rfi.project.sop ? session.rfi.project.sop.toISOString() : null,
      },
      documents: rfiDocs,
    });
    await prisma.turn.create({
      data: { sessionId, authorRole: "tml_agent", content: introTurn.text },
    });
    const supplierAck = await supplierIntroAck({
      supplierName: session.supplier.name,
      introMessage: introTurn.text,
    });
    await prisma.turn.create({
      data: { sessionId, authorRole: "supplier_agent", content: supplierAck.text },
    });
    return true;
  }

  // Fetch recent agent turns for conversational context (last 8 = ~4 Q&A pairs + acks)
  const recentTurns = await prisma.turn.findMany({
    where: {
      sessionId,
      authorRole: { in: ["tml_agent", "supplier_agent"] },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const recentHistory = recentTurns.reverse().map((t) => ({
    role: t.authorRole === "tml_agent" ? "tml" as const : "supplier" as const,
    content: t.content,
  }));

  const spec = ParameterSpecSchema.parse(pending.spec);

  // ── Per-variant elimination (PoC-style) ──────────────────────────────────
  // Load stored ELIM turns (captures text-type eliminations from prior steps)
  const existingElimTurns = await prisma.turn.findMany({
    where: { sessionId, authorRole: "system", content: { startsWith: "ELIM —" } },
  });

  // Load all must_have responses already stored for this session.
  const mhResponsesSoFar = await prisma.parameterResponse.findMany({
    where: { sessionId, parameter: { phase: "must_have" } },
    include: { parameter: true },
  });

  // Active variants = those without an ELIM system turn.
  // ELIM turns are written at each must_have step when a variant fails, so they are
  // the authoritative record. Re-deriving via computeEliminated() risks false positives
  // from aggressive fuzzy matching when all must_have responses are present at GTH time.
  const elimByTurns = extractElimFromTurns(existingElimTurns);
  // For must_have steps: also include deterministic re-checks for variants not yet ELIM'd
  // (handles edge case where catalogue was updated after an earlier step ran).
  const eliminated = computeEliminated(catalogueItems, mhResponsesSoFar, existingElimTurns);
  const activeItems = pending.phase === "good_to_have"
    ? catalogueItems.filter((item) => !elimByTurns[item.productCode])
    : catalogueItems.filter((item) => !eliminated[item.productCode]);

  // Build full variant spec objects for active items (PoC approach: LLM finds values itself)
  const activeVariantSpecs = activeItems.map((item) => ({
    productCode: item.productCode,
    params: item.parameters as Record<string, unknown>,
  }));

  // ── Acknowledgement turn (separate message before each question) ─────────
  // Only after at least one parameter has been answered — skip for the first question.
  // IMPORTANT: use the LAST ANSWERED parameter's spec, not the next pending one.
  if (answeredIds.size > 0) {
    const lastSupplierTurnRaw = recentTurns.find((t) => t.authorRole === "supplier_agent" && t.parameterId);
    const lastAnsweredParam = lastSupplierTurnRaw?.parameterId
      ? session.rfi.parameters.find((p) => p.id === lastSupplierTurnRaw.parameterId)
      : null;
    const lastSupplierContent = recentHistory.filter((t) => t.role === "supplier").pop();

    if (lastSupplierContent && lastAnsweredParam) {
      let lastAnsweredSpec: ParameterSpec;
      try { lastAnsweredSpec = ParameterSpecSchema.parse(lastAnsweredParam.spec); } catch { lastAnsweredSpec = spec; }
      const ackTurn = await tmlAcknowledgementTurn({
        lastSupplierAnswer: lastSupplierContent.content,
        parameter: {
          label: lastAnsweredParam.label,
          spec: lastAnsweredSpec,
          importance: lastAnsweredParam.importance,
          phase: lastAnsweredParam.phase,
        },
      });
      await prisma.turn.create({
        data: { sessionId, authorRole: "tml_agent", content: ackTurn.text },
      });
    }
  }

  // All phases: TML asks question → Supplier responds
  const tmlTurn = await tmlAgentTurn({
    parameter: {
      key: pending.key,
      label: pending.label,
      spec,
      importance: pending.importance,
      phase: pending.phase,
    },
    rfiTitle: session.rfi.title,
    componentCategory: session.rfi.componentCategory,
    priorContextSummary: prior.summaryText,
    documents: rfiDocs,
    recentHistory,
  });

  await prisma.turn.create({
    data: {
      sessionId,
      authorRole: "tml_agent",
      parameterId: pending.id,
      content: tmlTurn.text,
      citations: tmlTurn.citations.length > 0 ? (tmlTurn.citations as never) : undefined,
    },
  });

  // Include the TML question just asked in history for supplier context
  const historyWithTml = [
    ...recentHistory,
    { role: "tml" as const, content: tmlTurn.text },
  ];

  const supplierTurn = await supplierAgentTurn({
    parameter: { key: pending.key, label: pending.label, spec, phase: pending.phase },
    supplierName: session.supplier.name,
    variantSpecs: activeVariantSpecs,
    documents: catalogueDocs,
    question: tmlTurn.text,
    recentHistory: historyWithTml,
  });

  await prisma.turn.create({
    data: {
      sessionId,
      authorRole: "supplier_agent",
      parameterId: pending.id,
      content: supplierTurn.text,
      citations: supplierTurn.citations.length > 0 ? (supplierTurn.citations as never) : undefined,
    },
  });

  // ── Must-have elimination check (PoC-style per-variant) ────────────────────
  if (pending.phase === "must_have") {
    await Promise.all(activeItems.map(async (item) => {
      const val = findCatalogueValue(
        item.parameters as Record<string, unknown>,
        pending.key,
        pending.label,
      );
      if (val === undefined) return;

      let failReason: string | null = null;

      if (spec.type === "text" && spec.acceptanceCriteria) {
        const result = await evaluateLLM(String(val), spec, pending.label);
        if (result.verdict === "fail") failReason = result.rationale;
      } else if (spec.type !== "text" && spec.type !== "subjective") {
        const verdict = checkVariantValue(val, spec);
        if (verdict === "fail") {
          const raw = formatForEval(val);
          const det = evaluateDeterministic(raw, spec);
          failReason = det?.rationale ?? "does not meet requirement";
        }
      }

      if (failReason) {
        await prisma.turn.create({
          data: {
            sessionId,
            authorRole: "system",
            parameterId: pending.id,
            content: `ELIM — ${item.productCode}: failed "${pending.label}" — ${failReason}`,
          },
        });
      }
    }));
  }

  // ── Good-to-have per-variant LLM evaluation ───────────────────────────────
  if (pending.phase === "good_to_have") {
    await Promise.all(activeItems.map(async (item) => {
      const val = findCatalogueValue(
        item.parameters as Record<string, unknown>,
        pending.key,
        pending.label,
      );
      if (val === undefined || val === null) {
        await prisma.turn.create({
          data: {
            sessionId,
            authorRole: "system",
            parameterId: pending.id,
            content: `GTH_FAIL — ${item.productCode}: "${pending.label}" — not listed in catalogue`,
          },
        });
        return;
      }

      let passed = false;
      let reason = "";

      if (spec.type === "text" || spec.type === "subjective") {
        const result = await evaluateLLM(String(val), spec, pending.label);
        passed = result.verdict === "pass" || result.verdict === "partial";
        reason = result.rationale;
      } else {
        const verdict = checkVariantValue(val, spec);
        passed = verdict !== "fail";
        if (!passed) {
          const raw = formatForEval(val);
          const det = evaluateDeterministic(raw, spec);
          reason = det?.rationale ?? "does not meet preference";
        }
      }

      await prisma.turn.create({
        data: {
          sessionId,
          authorRole: "system",
          parameterId: pending.id,
          content: passed
            ? `GTH_PASS — ${item.productCode}: "${pending.label}"`
            : `GTH_FAIL — ${item.productCode}: "${pending.label}" — ${reason}`,
        },
      });
    }));
  }

  const evalResult = await evaluate(supplierTurn.text, spec, pending.label);
  await prisma.parameterResponse.create({
    data: {
      sessionId,
      parameterId: pending.id,
      rawResponse: supplierTurn.text,
      parsedValue: evalResult.parsedValue as never,
      verdict: evalResult.verdict,
      confidence: evalResult.confidence,
      rationale: evalResult.rationale,
      modificationDistance: evalResult.modificationDistance,
      evaluatedBy: evalResult.evaluatedBy,
    },
  });

  await advancePhaseIfNeeded(sessionId);

  return true;
}

/**
 * Run steps until session is no longer active (paused, completed, failed_veto) or no work pending.
 */
export async function runUntilBlocked(
  sessionId: string,
  tenantId: string,
  maxSteps = 50,
): Promise<{ stepsRun: number; finalStatus: string }> {
  let steps = 0;
  while (steps < maxSteps) {
    const advanced = await runOneStep(sessionId, tenantId);
    if (!advanced) break;
    steps++;
  }
  const final = await prisma.session.findUnique({ where: { id: sessionId } });
  console.log(`[auto-run] session=${sessionId} stepsRun=${steps} finalStatus=${final?.status} phase=${final?.currentPhase}`);
  return { stepsRun: steps, finalStatus: final?.status ?? "unknown" };
}

/**
 * Human interjection. If supersedePending is true and there's an unanswered pending parameter
 * in the current phase, the human's message is recorded as the supplier_user turn AND
 * any prior agent reply for the same parameter is marked superseded. Re-evaluation runs
 * against the human's message.
 */
export async function submitHumanTurn(opts: {
  sessionId: string;
  tenantId: string;
  userId: string;
  authorRole: "tml_user" | "supplier_user";
  content: string;
  documentIds?: string[];
}): Promise<{ turnId: string; reEvaluated: boolean }> {
  const session = await prisma.session.findFirst({
    where: { id: opts.sessionId, supplier: { tenantId: opts.tenantId } },
    include: {
      rfi: { include: { parameters: true } },
      responses: true,
    },
  });
  if (!session) throw new Error("session_not_found");
  if (session.status !== "active" && session.status !== "paused") {
    throw new Error("session_not_open_for_input");
  }

  // Find the most recently asked parameter in the current phase
  const answeredIds = new Set(session.responses.map((r) => r.parameterId));
  const phase = session.currentPhase as Phase;
  const phaseImportance = importanceForPhase(phase);
  let targetParam: { id: string; label: string; spec: unknown } | null = null;

  if (phaseImportance) {
    const lastTurn = await prisma.turn.findFirst({
      where: {
        sessionId: opts.sessionId,
        authorRole: { in: ["tml_agent", "supplier_agent"] },
        parameterId: { not: null },
      },
      orderBy: { createdAt: "desc" },
    });
    if (lastTurn?.parameterId && !answeredIds.has(lastTurn.parameterId)) {
      const p = session.rfi.parameters.find((x) => x.id === lastTurn.parameterId);
      if (p) targetParam = { id: p.id, label: p.label, spec: p.spec };
    } else {
      const pending = session.rfi.parameters.find(
        (p) => p.phase === phase && !answeredIds.has(p.id),
      );
      if (pending) targetParam = { id: pending.id, label: pending.label, spec: pending.spec };
    }
  }

  // Create the human turn, attaching documents if provided
  const turn = await prisma.turn.create({
    data: {
      sessionId: opts.sessionId,
      authorRole: opts.authorRole,
      userId: opts.userId,
      parameterId: targetParam?.id,
      content: opts.content,
    },
  });

  if (opts.documentIds && opts.documentIds.length > 0) {
    await prisma.document.updateMany({
      where: { id: { in: opts.documentIds }, uploadedById: opts.userId, turnId: null },
      data: { turnId: turn.id, scope: "turn" },
    });
  }

  // Re-evaluation: only if the human is the supplier side, and parameter not yet answered.
  // Supersede the prior supplier_agent reply for this parameter.
  let reEvaluated = false;
  if (
    targetParam &&
    opts.authorRole === "supplier_user" &&
    !answeredIds.has(targetParam.id)
  ) {
    const priorAgentReply = await prisma.turn.findFirst({
      where: {
        sessionId: opts.sessionId,
        parameterId: targetParam.id,
        authorRole: "supplier_agent",
        supersededById: null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (priorAgentReply) {
      await prisma.turn.update({
        where: { id: priorAgentReply.id },
        data: { supersededById: turn.id },
      });
    }

    const spec = ParameterSpecSchema.parse(targetParam.spec);
    const evalResult = await evaluate(opts.content, spec, targetParam.label);
    await prisma.parameterResponse.upsert({
      where: {
        sessionId_parameterId: {
          sessionId: opts.sessionId,
          parameterId: targetParam.id,
        },
      },
      update: {
        rawResponse: opts.content,
        parsedValue: evalResult.parsedValue as never,
        verdict: evalResult.verdict,
        confidence: evalResult.confidence,
        rationale: evalResult.rationale,
        modificationDistance: evalResult.modificationDistance,
        evaluatedBy: evalResult.evaluatedBy,
        reEvaluated: true,
      },
      create: {
        sessionId: opts.sessionId,
        parameterId: targetParam.id,
        rawResponse: opts.content,
        parsedValue: evalResult.parsedValue as never,
        verdict: evalResult.verdict,
        confidence: evalResult.confidence,
        rationale: evalResult.rationale,
        modificationDistance: evalResult.modificationDistance,
        evaluatedBy: evalResult.evaluatedBy,
        reEvaluated: false,
      },
    });
    reEvaluated = true;
    await advancePhaseIfNeeded(opts.sessionId);
  }

  return { turnId: turn.id, reEvaluated };
}

async function advancePhaseIfNeeded(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      rfi: { include: { parameters: true } },
      responses: { include: { parameter: true } },
    },
  });
  if (!session) return;

  const phaseParams = session.rfi.parameters.filter(
    (p) => p.phase === session.currentPhase,
  );
  const answers: ParameterAnswerSummary[] = session.responses.map((r) => ({
    parameterId: r.parameterId,
    importance: r.parameter.importance,
    verdict: r.verdict,
  }));

  const decision = decideAdvance(
    session.currentPhase as Phase,
    phaseParams.map((p) => ({ id: p.id, importance: p.importance })),
    answers,
  );

  if (decision.kind === "advance") {
    await prisma.session.update({
      where: { id: sessionId },
      data: { currentPhase: decision.to },
    });
    await prisma.turn.create({
      data: {
        sessionId,
        authorRole: "system",
        content: `Phase advanced: ${decision.from} → ${decision.to}`,
      },
    });
  } else if (decision.kind === "fail_veto") {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "failed_veto", currentPhase: "completed", completedAt: new Date() },
    });
    await prisma.turn.create({
      data: {
        sessionId,
        authorRole: "system",
        content: "Session ended: must-have requirement failed.",
      },
    });
    await generateAndStoreReport(sessionId);
  } else if (decision.kind === "complete") {
    await prisma.session.update({
      where: { id: sessionId },
      data: { status: "completed", currentPhase: "completed", completedAt: new Date() },
    });
    await prisma.turn.create({
      data: { sessionId, authorRole: "system", content: "All phases complete." },
    });
    await generateAndStoreReport(sessionId);
  }
}

function toDocSummary(doc: Document): { id: string; filename: string; excerpt: string | null } {
  return { id: doc.id, filename: doc.filename, excerpt: excerpt(doc.extractedText) };
}

export async function generateAndStoreReport(sessionId: string): Promise<void> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      rfi: { include: { project: true, parameters: true } },
      supplier: { include: { catalogue: true } },
      responses: { include: { parameter: true } },
      turns: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) return;

  // Compute per-variant statuses for the report
  const nc = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
  const tCat = nc(session.rfi.componentCategory);
  const relCatalogue = session.supplier.catalogue.filter((item) => {
    const ic = nc(item.componentCategory);
    return ic === tCat || ic.includes(tCat) || tCat.includes(ic);
  });
  const mhParams = session.rfi.parameters.filter((p) => p.phase === "must_have");
  const gthParams = session.rfi.parameters.filter((p) => p.phase === "good_to_have");
  const mhResponses = session.responses.filter((r) => r.parameter.phase === "must_have");
  const elimTurns = session.turns.filter(
    (t) => t.authorRole === "system" && t.content.startsWith("ELIM —"),
  );
  const gthTurns = session.turns.filter(
    (t) => t.authorRole === "system" &&
      (t.content.startsWith("GTH_PASS —") || t.content.startsWith("GTH_FAIL —")),
  );
  const eliminated = computeEliminated(relCatalogue, mhResponses, elimTurns);

  const variantStatuses: VariantStatus[] = relCatalogue.map((item) => {
    const params = item.parameters as Record<string, unknown>;
    const elim = eliminated[item.productCode];
    let mhPassed = 0;
    for (const resp of mhResponses) {
      if (elim && elim.eliminatedAt === resp.parameter.label) break;
      let spec: ParameterSpec;
      try { spec = ParameterSpecSchema.parse(resp.parameter.spec); } catch { mhPassed++; continue; }
      if (spec.type === "text" || spec.type === "subjective") { mhPassed++; continue; }
      const val = findCatalogueValue(params, resp.parameter.key, resp.parameter.label);
      if (checkVariantValue(val, spec) !== "fail") mhPassed++;
      else break;
    }
    return {
      productCode: item.productCode,
      status: elim ? "eliminated" : "active",
      eliminatedAt: elim?.eliminatedAt ?? null,
      eliminationReason: elim?.eliminationReason ?? null,
      mhPassed,
      mhTotal: mhParams.length,
      gthMatched: computeGthMatched(item.productCode, gthTurns),
      gthTotal: gthParams.length,
    };
  });

  const payload = buildComplianceReport({
    rfi: {
      id: session.rfi.id,
      title: session.rfi.title,
      componentCategory: session.rfi.componentCategory,
      project: {
        name: session.rfi.project.name,
        vehicleType: session.rfi.project.vehicleType,
        targetMarket: session.rfi.project.targetMarket,
      },
    },
    supplier: {
      id: session.supplier.id,
      name: session.supplier.name,
      contactEmail: session.supplier.contactEmail,
    },
    session: {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
    responses: session.responses.map((r) => ({
      parameter: {
        key: r.parameter.key,
        label: r.parameter.label,
        importance: r.parameter.importance,
        phase: r.parameter.phase,
      },
      rawResponse: r.rawResponse,
      verdict: r.verdict,
      confidence: r.confidence,
      rationale: r.rationale,
      modificationDistance: r.modificationDistance,
      evaluatedBy: r.evaluatedBy,
    })),
    variants: variantStatuses,
  });

  await prisma.complianceReport.create({
    data: { sessionId: session.id, payload: payload as never },
  });
}

export async function getSessionDetail(
  sessionId: string,
  tenantId: string,
  userRole: string,
  userSupplierId: string | null,
): Promise<unknown> {
  const where =
    userRole === "SUPPLIER_ENGINEER"
      ? { id: sessionId, supplierId: userSupplierId ?? "" }
      : { id: sessionId, supplier: { tenantId } };

  const session = await prisma.session.findFirst({
    where,
    include: {
      rfi: {
        include: {
          project: true,
          parameters: { orderBy: [{ phase: "asc" }, { ordering: "asc" }] },
          documents: true,
        },
      },
      supplier: { include: { catalogue: { include: { documents: true } } } },
      turns: {
        orderBy: { createdAt: "asc" },
        include: { user: { select: { fullName: true, email: true } }, documents: true },
      },
      responses: { include: { parameter: true } },
    },
  });
  if (!session) return null;

  // Compute per-variant statuses (PoC-style, derived from catalogue values + specs)
  const nc = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, "");
  const tCat = nc(session.rfi.componentCategory);
  const relCatalogue = session.supplier.catalogue.filter((item) => {
    const ic = nc(item.componentCategory);
    return ic === tCat || ic.includes(tCat) || tCat.includes(ic);
  });

  const mhParams = session.rfi.parameters.filter((p) => p.phase === "must_have");
  const gthParams = session.rfi.parameters.filter((p) => p.phase === "good_to_have");
  const mhResponses = session.responses.filter((r) => r.parameter.phase === "must_have");

  // Include stored ELIM turns so text-type eliminations are reflected in variant statuses
  const sessionElimTurns = session.turns.filter(
    (t) => t.authorRole === "system" && t.content.startsWith("ELIM —"),
  );
  const eliminated = computeEliminated(relCatalogue, mhResponses, sessionElimTurns);

  // GTH results are stored as GTH_PASS/GTH_FAIL system turns written during runOneStep
  const sessionGthTurns = session.turns.filter(
    (t) => t.authorRole === "system" && (t.content.startsWith("GTH_PASS —") || t.content.startsWith("GTH_FAIL —")),
  );

  const variantStatuses: VariantStatus[] = relCatalogue.map((item) => {
    const params = item.parameters as Record<string, unknown>;
    const elim = eliminated[item.productCode];

    // MH passed: deterministic for numeric; text must-haves tracked via ELIM turns
    let mhPassed = 0;
    for (const resp of mhResponses) {
      if (elim && elim.eliminatedAt === resp.parameter.label) break;
      let spec: ParameterSpec;
      try { spec = ParameterSpecSchema.parse(resp.parameter.spec); } catch { mhPassed++; continue; }
      if (spec.type === "text" || spec.type === "subjective") {
        mhPassed++;
        continue;
      }
      const val = findCatalogueValue(params, resp.parameter.key, resp.parameter.label);
      const verdict = checkVariantValue(val, spec);
      if (verdict !== "fail") mhPassed++;
      else break;
    }

    // GTH matched: read from stored GTH_PASS system turns (written by runOneStep via LLM)
    const gthMatched = computeGthMatched(item.productCode, sessionGthTurns);

    return {
      productCode: item.productCode,
      status: elim ? "eliminated" : "active",
      eliminatedAt: elim?.eliminatedAt ?? null,
      eliminationReason: elim?.eliminationReason ?? null,
      mhPassed,
      mhTotal: mhParams.length,
      gthMatched,
      gthTotal: gthParams.length,
    };
  });

  return { ...session, variantStatuses };
}
