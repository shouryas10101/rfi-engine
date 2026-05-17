import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { VerdictBadge } from "../components/Badges";

type Turn = {
  id: string;
  authorRole: "tml_agent" | "supplier_agent" | "tml_user" | "supplier_user" | "system";
  content: string;
  parameterId: string | null;
  supersededById: string | null;
  citations: { documentId: string; filename: string }[] | null;
  createdAt: string;
  user: { fullName: string | null; email: string } | null;
  documents: { id: string; filename: string; mimeType: string; sizeBytes: number }[];
};

type Response = {
  parameterId: string;
  verdict: string;
  rationale: string;
  evaluatedBy: string;
  reEvaluated: boolean;
  parameter?: { key: string; label: string; phase: string; importance: string };
};

type VariantStatus = {
  productCode: string;
  status: "active" | "eliminated";
  eliminatedAt: string | null;
  eliminationReason: string | null;
  mhPassed: number;
  mhTotal: number;
  gthMatched: number;
  gthTotal: number;
};

type SessionDetail = {
  id: string;
  status: "pending" | "active" | "paused" | "completed" | "failed_veto" | "abandoned";
  currentPhase: string;
  rfi: {
    id: string;
    title: string;
    componentCategory: string;
    project: { name: string };
    parameters: { id: string; label: string; phase: string }[];
    documents: { id: string; filename: string; mimeType: string; sizeBytes: number; extractionStatus: string }[];
  };
  supplier: {
    id: string;
    name: string;
    logoUrl: string | null;
    catalogue: { id: string; productCode: string; documents: { id: string; filename: string; mimeType: string; sizeBytes: number; extractionStatus: string }[] }[];
  };
  turns: Turn[];
  responses: Response[];
  variantStatuses: VariantStatus[];
};

const POLL_INTERVAL_MS = 1500;

const PHASE_LIST = [
  { id: "general",      label: "General",       color: "bg-ink-400" },
  { id: "must_have",    label: "Must-have",     color: "bg-red-500" },
  { id: "good_to_have", label: "Good-to-have",  color: "bg-blue-500" },
  { id: "subjective",   label: "Subjective",    color: "bg-purple-500" },
] as const;

const PHASES_ALL = [
  { id: "general",      label: "General Queries", short: "P1" },
  { id: "must_have",    label: "Must Have",        short: "P2" },
  { id: "good_to_have", label: "Good to Have",     short: "P3" },
  { id: "subjective",   label: "Subjective",       short: "P4" },
  { id: "completed",    label: "Complete",         short: "✓"  },
];

const V_COLORS = [
  { text: "text-blue-600",    dot: "bg-blue-500",    bar: "bg-blue-500",    activeBorder: "border-b-blue-500"   },
  { text: "text-amber-600",   dot: "bg-amber-500",   bar: "bg-amber-500",   activeBorder: "border-b-amber-500"  },
  { text: "text-emerald-600", dot: "bg-emerald-500", bar: "bg-emerald-500", activeBorder: "border-b-emerald-500" },
  { text: "text-purple-600",  dot: "bg-purple-500",  bar: "bg-purple-500",  activeBorder: "border-b-purple-500" },
  { text: "text-orange-600",  dot: "bg-orange-500",  bar: "bg-orange-500",  activeBorder: "border-b-orange-500" },
];
function vc(i: number) { return V_COLORS[i % V_COLORS.length]; }

function importanceLabel(imp: string) {
  if (imp === "must") return "Must-have";
  if (imp === "good") return "Good-to-have";
  if (imp === "subjective") return "Subjective";
  return imp;
}

function ImportanceBadge({ importance }: { importance: string }) {
  const styles: Record<string, string> = {
    must: "bg-red-100 text-red-700 border-red-200",
    good: "bg-blue-100 text-blue-700 border-blue-200",
    subjective: "bg-purple-100 text-purple-700 border-purple-200",
    general: "bg-ink-100 text-ink-600 border-ink-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border ${styles[importance] ?? styles.general}`}>
      {importanceLabel(importance)}
    </span>
  );
}

export default function ChatPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [running, setRunning] = useState(false);
  const [activeVariantIdx, setActiveVariantIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSupplier = user?.role === "SUPPLIER_ENGINEER";

  async function load() {
    try {
      const r = await api.get(`/sessions/${id}`);
      setSession(r.data.session);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "load_failed");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session?.turns.length]);

  async function startSession() {
    setError(null);
    setRunning(true);
    try {
      await api.post(`/sessions/${id}/start`);
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "start_failed");
    } finally {
      setRunning(false);
    }
  }

  async function pauseSession() {
    await api.post(`/sessions/${id}/pause`);
    await load();
  }

  async function resumeSession() {
    setError(null);
    setRunning(true);
    try {
      await api.post(`/sessions/${id}/resume`);
      await load();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "resume_failed");
    } finally {
      setRunning(false);
    }
  }

  async function uploadAttachment(): Promise<string | null> {
    if (!pendingFile) return null;
    const fd = new FormData();
    fd.append("file", pendingFile);
    const r = await api.post("/documents/upload-for-turn", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return r.data.document.id;
  }

  async function submitInterjection(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() && !pendingFile) return;
    setSubmitting(true);
    setError(null);
    try {
      let attachedDocId: string | null = null;
      if (pendingFile) attachedDocId = await uploadAttachment();
      await api.post(`/sessions/${id}/interject`, {
        content: input.trim() || `[Attachment: ${pendingFile?.name}]`,
        documentIds: attachedDocId ? [attachedDocId] : undefined,
      });
      setInput("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error ?? "interjection_failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (error && !session) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="card text-sm text-ink-600 max-w-md">
          <p>Session unavailable: <span className="text-red-600">{error.replace(/_/g, " ")}</span></p>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="h-full flex items-center justify-center text-ink-400 text-sm">
        Loading session...
      </div>
    );
  }

  const isTerminal = session.status === "completed" || session.status === "failed_veto" || session.status === "abandoned";
  const canStart = session.status === "pending";
  const canResume = session.status === "paused";
  const canInterject = session.status === "active" || session.status === "paused";

  const responsesByParam: Record<string, Response> = {};
  for (const r of session.responses) responsesByParam[r.parameterId] = r;

  const phaseIdx = PHASES_ALL.findIndex((p) => p.id === session.currentPhase);
  const variantStatuses = session.variantStatuses ?? [];
  const variants = session.supplier.catalogue;
  const variantNames = variants.map((c) => c.productCode);

  // Phase stats for left sidebar
  const phaseStats = PHASE_LIST.map(({ id: phId, label, color }) => {
    const total = session.rfi.parameters.filter((p) => p.phase === phId).length;
    const answered = session.responses.filter((r) => r.parameter?.phase === phId).length;
    const passed = session.responses.filter(
      (r) => r.parameter?.phase === phId && (r.verdict === "pass" || r.verdict === "not_applicable"),
    ).length;
    const failed = session.responses.filter(
      (r) => r.parameter?.phase === phId && r.verdict === "fail",
    ).length;
    return { phId, label, color, total, answered, passed, failed };
  }).filter((s) => s.total > 0);

  // Status display
  const totalParams = session.rfi.parameters.length;
  const answeredParams = session.responses.length;

  const statusColor: Record<string, string> = {
    active: "text-blue-600 bg-blue-50 border-blue-200",
    completed: "text-green-700 bg-green-50 border-green-200",
    failed_veto: "text-red-600 bg-red-50 border-red-200",
    paused: "text-amber-600 bg-amber-50 border-amber-200",
    pending: "text-ink-600 bg-ink-50 border-ink-200",
    abandoned: "text-ink-500 bg-ink-50 border-ink-200",
  };
  const statusLabel: Record<string, string> = {
    active: "Active",
    completed: "Completed",
    failed_veto: "Failed (veto)",
    paused: "Paused",
    pending: "Pending",
    abandoned: "Abandoned",
  };

  // Determine current parameter for right panel
  const lastTmlTurn = [...session.turns].reverse().find(
    (t) => t.authorRole === "tml_agent" && t.parameterId,
  );
  const currentParamId = lastTmlTurn?.parameterId ?? null;
  const currentResponse = currentParamId ? responsesByParam[currentParamId] : null;
  const currentParam = currentResponse?.parameter ??
    (currentParamId ? (() => { const p = session.rfi.parameters.find(p => p.id === currentParamId); return p ? { key: "", label: p.label, phase: p.phase, importance: "" } : null; })() : null);

  const supplierValueTurn = currentParamId
    ? [...session.turns].reverse().find(
        (t) => t.authorRole === "supplier_agent" && t.parameterId === currentParamId && !t.supersededById,
      )
    : null;

  // Variant score
  function variantScore(vs: VariantStatus): number {
    if (vs.status === "eliminated") return 0;
    const mh = vs.mhTotal > 0 ? (vs.mhPassed / vs.mhTotal) * 50 : 0;
    const gth = vs.gthTotal > 0 ? (vs.gthMatched / vs.gthTotal) * 30 : 0;
    return Math.round(mh + gth);
  }

  // Filter turns for variant tab
  const selectedVariantName = activeVariantIdx !== null ? variantNames[activeVariantIdx] : null;
  const visibleTurns = session.turns.filter((t) => {
    if (!selectedVariantName) return true;
    if (t.authorRole !== "supplier_agent") return true;
    const lower = t.content.toLowerCase();
    const mentioned = variantNames.find((n) => lower.includes(n.toLowerCase()));
    return mentioned === undefined || mentioned === selectedVariantName;
  });

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Breadcrumb bar */}
      <div className="flex-shrink-0 px-5 py-2 border-b border-ink-100 bg-white flex items-center gap-1.5 text-sm">
        <Link to="/sessions" className="text-ink-400 hover:text-ink-600 transition-colors">Sessions</Link>
        <span className="text-ink-300">›</span>
        <span className="text-ink-400">{session.rfi.title}</span>
        <span className="text-ink-300">›</span>
        <span className="text-ink-700 font-medium">{session.supplier.name}</span>
      </div>

      {/* Body: 3 columns */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Left sidebar ── */}
        <aside className="w-60 flex-shrink-0 bg-ink-50 border-r border-ink-200 flex flex-col overflow-y-auto">
          <div className="p-4 flex-1">
            {/* Session label */}
            <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-3">Session</p>

            {/* Supplier name + component */}
            <h2 className="text-base font-semibold text-ink-900 leading-snug">{session.supplier.name}</h2>
            <p className="text-xs text-ink-400 mt-0.5 mb-5">{session.rfi.componentCategory}</p>

            {/* Status */}
            <div className="mb-5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-2">Status</p>
              <div className="flex items-center justify-between mb-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border ${statusColor[session.status] ?? statusColor.pending}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${session.status === "active" ? "bg-blue-500 animate-pulse" : session.status === "failed_veto" ? "bg-red-500" : session.status === "completed" ? "bg-green-500" : "bg-current opacity-60"}`} />
                  {statusLabel[session.status] ?? session.status}
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-1 bg-ink-200 rounded-full overflow-hidden mb-1.5">
                <div
                  className={`h-full rounded-full transition-all ${session.status === "failed_veto" ? "bg-red-500" : "bg-accent-600"}`}
                  style={{ width: totalParams > 0 ? `${(answeredParams / totalParams) * 100}%` : "0%" }}
                />
              </div>
              <p className="text-[10px] text-ink-400 font-mono">
                {answeredParams} / {totalParams} parameters answered
              </p>
            </div>

            {/* Phases */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-2">Phases</p>
              <div className="space-y-1.5">
                {phaseStats.map(({ phId, label, color, total, answered, passed, failed }) => {
                  const isActive = session.currentPhase === phId;
                  const isDone = answered === total && total > 0;
                  return (
                    <div
                      key={phId}
                      className={`rounded-md p-2.5 transition-colors border ${isActive ? "bg-white border-ink-200 shadow-sm" : "bg-ink-100/60 border-transparent hover:bg-ink-100"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color}`} />
                          <span className="text-xs font-medium text-ink-700">{label}</span>
                        </div>
                        <span className="text-[10px] font-mono text-ink-400">{answered}/{total}</span>
                      </div>
                      {answered > 0 && (
                        <div className="flex items-center gap-1.5 pl-3.5 flex-wrap">
                          {passed > 0 && (
                            <span className="text-[9px] font-mono text-green-700 bg-green-100 rounded px-1.5 py-0.5">
                              {passed} pass
                            </span>
                          )}
                          {failed > 0 && (
                            <span className="text-[9px] font-mono text-red-700 bg-red-100 rounded px-1.5 py-0.5">
                              {failed} fail
                            </span>
                          )}
                          {answered - passed - failed > 0 && (
                            <span className="text-[9px] font-mono text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                              {answered - passed - failed} partial
                            </span>
                          )}
                          {isDone && failed === 0 && (
                            <span className="text-[9px] font-mono text-ink-400 ml-auto">✓</span>
                          )}
                        </div>
                      )}
                      {answered === 0 && (
                        <p className="text-[9px] text-ink-400 pl-3.5 font-mono">pending</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom: active indicator */}
          {session.status === "active" && (
            <div className="px-4 py-3 border-t border-ink-200 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-600 animate-pulse" />
              <span className="text-[10px] text-ink-400 font-mono">
                evaluating {session.responses.length + 1} of {totalParams}
              </span>
            </div>
          )}
        </aside>

        {/* ── Center: chat ── */}
        <div className="flex-1 flex flex-col overflow-hidden border-x border-ink-100">

          {/* Chat header */}
          <div className="flex-shrink-0 px-5 py-3 border-b border-ink-100 bg-white flex items-center gap-3">
            <LogoAvatar src="/tata-logo.svg" fallback="TML" size="sm" />
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-ink-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink-900 truncate">
                {isSupplier ? "TML - Vishwakarma" : `${session.supplier.name} - Anveshak`}
              </p>
              <p className="text-xs text-ink-400">{session.rfi.title}</p>
            </div>
            <LogoAvatar src={session.supplier.logoUrl} fallback={session.supplier.name.slice(0, 2).toUpperCase()} size="sm" bgClass="bg-violet-700" />
          </div>

          {/* Phase ribbon */}
          <div className="flex-shrink-0 flex bg-ink-50 border-b border-ink-100 px-4 overflow-x-auto">
            {PHASES_ALL.map((phase, pi) => {
              const done = phaseIdx > pi && session.currentPhase !== "pending";
              const active = session.currentPhase === phase.id;
              return (
                <div
                  key={phase.id}
                  className={`flex items-center gap-1.5 px-3 py-2 text-[10px] font-mono border-b-2 whitespace-nowrap transition-colors ${
                    active
                      ? "border-b-accent-500 text-accent-600"
                      : done
                      ? "border-b-emerald-500 text-emerald-600"
                      : "border-b-transparent text-ink-300"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] border ${
                      active
                        ? "border-accent-400 bg-accent-50 text-accent-600"
                        : done
                        ? "border-emerald-400 bg-emerald-50 text-emerald-600"
                        : "border-ink-200 bg-white text-ink-300"
                    }`}
                  >
                    {done ? "✓" : phase.short}
                  </div>
                  {phase.label}
                </div>
              );
            })}
          </div>

          {/* Pending start screen */}
          {canStart && (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="card max-w-2xl">
                <p className="text-sm font-semibold mb-2">Ready to start the agent conversation</p>
                <p className="text-xs text-ink-400 mb-4">
                  The TML agent will ask each parameter in order. The {session.supplier.name} agent will answer
                  from its catalogue across {variants.length} variant{variants.length !== 1 ? "s" : ""}. Both grounded in the documents below.
                </p>
                <div className="grid md:grid-cols-2 gap-3 mb-4">
                  <div className="bg-ink-50 rounded-md p-3">
                    <p className="text-[10px] uppercase tracking-wide text-ink-400 mb-2 font-mono">RFI documents</p>
                    {session.rfi.documents.length === 0 ? (
                      <p className="text-xs text-amber-700">
                        None uploaded.{" "}
                        <a href={`/rfis/${session.rfi.id}`} className="underline hover:opacity-70">Upload on the RFI page</a>
                      </p>
                    ) : (
                      session.rfi.documents.map((d) => (
                        <p key={d.id} className="text-xs text-ink-600 flex items-center gap-1.5 mb-0.5">
                          <span className="w-3.5 h-3.5 rounded bg-red-100 text-red-700 flex items-center justify-center text-[8px] font-bold flex-shrink-0">P</span>
                          {d.filename}
                        </p>
                      ))
                    )}
                  </div>
                  <div className="bg-ink-50 rounded-md p-3">
                    <p className="text-[10px] uppercase tracking-wide text-ink-400 mb-2 font-mono">{session.supplier.name} catalogue</p>
                    {variants.length === 0 ? (
                      <p className="text-xs text-amber-700">No catalogue items.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {variants.map((item, vi) => (
                          <div key={item.id} className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${vc(vi).dot}`} />
                            <span className="text-xs font-medium text-ink-700">{item.productCode}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={startSession} disabled={running} className="btn-primary">
                  {running ? "Starting..." : "Start session"}
                </button>
              </div>
            </div>
          )}

          {/* Variant tabs */}
          {!canStart && variants.length > 0 && (
            <div className="flex-shrink-0 flex bg-white border-b border-ink-100 px-4 gap-1 overflow-x-auto">
              <button
                onClick={() => setActiveVariantIdx(null)}
                className={`px-3 py-2 text-[11px] font-mono border-b-2 whitespace-nowrap transition-colors ${
                  activeVariantIdx === null
                    ? "border-b-ink-500 text-ink-700"
                    : "border-b-transparent text-ink-400 hover:text-ink-600"
                }`}
              >
                All variants
              </button>
              {variants.map((item, vi) => {
                const vs = variantStatuses.find((s) => s.productCode === item.productCode);
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveVariantIdx(vi === activeVariantIdx ? null : vi)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono border-b-2 whitespace-nowrap transition-colors ${
                      activeVariantIdx === vi
                        ? `${vc(vi).activeBorder} ${vc(vi).text}`
                        : "border-b-transparent text-ink-400 hover:text-ink-600"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${vs?.status === "eliminated" ? "bg-red-400" : vc(vi).dot}`} />
                    {item.productCode}
                    {vs?.status === "eliminated" && <span className="text-red-400 text-[9px]">✕</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Chat thread */}
          {!canStart && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#fafaf9]">
              {visibleTurns.length === 0 && (
                <p className="text-sm text-ink-400">No messages yet.</p>
              )}
              {visibleTurns.map((t) => (
                <TurnView
                  key={t.id}
                  turn={t}
                  response={t.parameterId ? responsesByParam[t.parameterId] : undefined}
                  isSupplierViewer={isSupplier}
                  variantNames={variantNames}
                  supplierName={session.supplier.name}
                  supplierLogoUrl={session.supplier.logoUrl}
                />
              ))}
              {session.status === "active" && answeredParams < totalParams && (() => {
                const lastAgentTurn = [...visibleTurns].reverse().find(
                  (t) => t.authorRole === "tml_agent" || t.authorRole === "supplier_agent"
                );
                const typingSide = lastAgentTurn?.authorRole === "tml_agent" ? "supplier" : "tml";
                return (
                  <TypingBubble
                    side={typingSide}
                    supplierLogoUrl={session.supplier.logoUrl}
                    supplierInitials={session.supplier.name.slice(0, 2).toUpperCase()}
                  />
                );
              })()}
            </div>
          )}

          {/* Controls */}
          {canInterject && (
            <div className="flex-shrink-0 border-t border-ink-100 p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-ink-400">
                  {session.status === "active" ? "Agents are live — interject anytime." : "Session paused."}
                </p>
                <div className="flex gap-1.5">
                  {session.status === "active" && (
                    <button onClick={pauseSession} className="btn-secondary text-xs py-1">Pause</button>
                  )}
                  {canResume && (
                    <button onClick={resumeSession} disabled={running} className="btn-primary text-xs py-1">Resume</button>
                  )}
                </div>
              </div>
              <form onSubmit={submitInterjection}>
                <textarea
                  className="input min-h-[52px] resize-y text-sm"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isSupplier ? "Note as supplier — clarify or correct your agent..." : "Note as TML — pause, ask, or steer..."}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                      accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,application/pdf"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs text-ink-400 hover:text-ink-600"
                    >
                      + Attach
                    </button>
                    {pendingFile && (
                      <span className="text-xs text-ink-600 truncate flex-1">
                        {pendingFile.name}
                        <button type="button" onClick={() => setPendingFile(null)} className="ml-2 text-red-500">×</button>
                      </span>
                    )}
                  </div>
                  <button type="submit" disabled={submitting || (!input.trim() && !pendingFile)} className="btn-primary text-sm">
                    {submitting ? "Sending..." : "Send"}
                  </button>
                </div>
                {error && <p className="text-xs text-red-600 mt-2">{error.replace(/_/g, " ")}</p>}
              </form>
            </div>
          )}

          {isTerminal && (
            <div className="flex-shrink-0 border-t border-ink-100 p-4 bg-white flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">
                  {session.status === "completed"
                    ? "All phases complete."
                    : session.status === "failed_veto"
                    ? "Session ended: must-have failure."
                    : "Session ended."}
                </p>
                <p className="text-xs text-ink-400 mt-0.5">Compliance report has been generated.</p>
              </div>
              <button onClick={() => nav(`/sessions/${id}/report`)} className="btn-primary">View report</button>
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <aside className="w-72 flex-shrink-0 overflow-y-auto bg-white border-l border-ink-100">
          <div className="p-4 space-y-5">

            {/* Current parameter */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-3">Current parameter</p>
              {currentParam ? (
                <div>
                  <p className="text-sm font-semibold text-ink-900 mb-2">{currentParam.label}</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {currentParam.importance && <ImportanceBadge importance={currentParam.importance} />}
                    {currentResponse && (
                      <VerdictBadge verdict={currentResponse.verdict} />
                    )}
                  </div>
                  {currentParam.key && (
                    <p className="text-[11px] font-mono text-ink-500 bg-ink-50 rounded px-2 py-1 mb-3">{currentParam.key}</p>
                  )}

                  {supplierValueTurn && (
                    <div className="mb-2">
                      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-1">Supplier value</p>
                      <div className="bg-ink-50 rounded-md px-2.5 py-2 text-xs font-mono text-ink-700 leading-relaxed">
                        {supplierValueTurn.content.length > 120
                          ? supplierValueTurn.content.slice(0, 120) + "…"
                          : supplierValueTurn.content}
                      </div>
                    </div>
                  )}

                  {currentResponse?.rationale && (
                    <div>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-1">Rationale</p>
                      <p className="text-xs text-ink-600 leading-relaxed">{currentResponse.rationale}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-ink-400">No parameter being evaluated yet.</p>
              )}
            </div>

            <div className="border-t border-ink-100" />

            {/* Grounding documents */}
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-3">Grounding</p>

              {session.rfi.documents.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-ink-400 mb-1.5">RFI documents</p>
                  <div className="space-y-1">
                    {session.rfi.documents.map((d) => (
                      <div key={d.id} className="flex items-center gap-2 text-xs text-ink-600">
                        <svg className="w-3 h-3 text-ink-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        <span className="truncate">{d.filename}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {variants.length > 0 && (
                <div>
                  <p className="text-[10px] text-ink-400 mb-1.5">{session.supplier.name} catalogue</p>
                  <div className="space-y-1.5">
                    {variants.map((item, vi) => (
                      <div key={item.id}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${vc(vi).dot}`} />
                          <span className={`text-xs font-medium ${vc(vi).text}`}>{item.productCode}</span>
                        </div>
                        {item.documents.map((d) => (
                          <div key={d.id} className="flex items-center gap-2 text-xs text-ink-500 pl-3.5">
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                            </svg>
                            <span className="truncate">{d.filename}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {session.rfi.documents.length === 0 && variants.length === 0 && (
                <p className="text-xs text-ink-400">No documents attached.</p>
              )}
            </div>

            {/* Variant status summary */}
            {variantStatuses.length > 0 && (
              <>
                <div className="border-t border-ink-100" />
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-3">Variant status</p>
                  <div className="space-y-2">
                    {variants.map((item, vi) => {
                      const vs = variantStatuses.find((s) => s.productCode === item.productCode);
                      const isElim = vs?.status === "eliminated";
                      const score = vs ? variantScore(vs) : 0;
                      const color = vc(vi);
                      return (
                        <div
                          key={item.id}
                          onClick={() => setActiveVariantIdx(vi === activeVariantIdx ? null : vi)}
                          className={`rounded-md border p-2 cursor-pointer transition-colors ${
                            isElim ? "border-red-100 bg-red-50" : "border-ink-100 bg-ink-50 hover:border-ink-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={`text-xs font-semibold font-mono ${isElim ? "text-red-600" : color.text}`}>
                              {item.productCode}
                            </span>
                            {isElim ? (
                              <span className="text-[9px] font-mono text-red-500 font-bold">ELIM</span>
                            ) : (
                              <span className={`text-sm font-bold font-mono ${color.text}`}>{score}%</span>
                            )}
                          </div>
                          {!isElim && (
                            <>
                              <div className="h-1 bg-ink-200 rounded-full overflow-hidden mb-1">
                                <div className={`h-full rounded-full transition-all ${color.bar}`} style={{ width: `${score}%` }} />
                              </div>
                              <p className="text-[9px] font-mono text-ink-400">
                                MH {vs?.mhPassed ?? 0}/{vs?.mhTotal ?? 0} · GTH {vs?.gthMatched ?? 0}/{vs?.gthTotal ?? 0}
                              </p>
                            </>
                          )}
                          {isElim && (
                            <p className="text-[9px] text-red-400 font-mono">Must-have failure</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function LogoAvatar({
  src,
  fallback,
  size = "md",
  bgClass = "bg-blue-900",
  dim = false,
}: {
  src: string | null | undefined;
  fallback: string;
  size?: "sm" | "md";
  bgClass?: string;
  dim?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const dim_ = dim ? "opacity-40" : "";
  const sizeClass = size === "sm" ? "w-8 h-8" : "w-7 h-7";
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={fallback}
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 border border-ink-200 bg-white ${dim_}`}
      />
    );
  }
  return (
    <div className={`${sizeClass} rounded-full flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0 ${bgClass} ${dim_}`}>
      {fallback.slice(0, 2)}
    </div>
  );
}

function TypingBubble({ side, supplierLogoUrl, supplierInitials }: { side: "tml" | "supplier"; supplierLogoUrl: string | null | undefined; supplierInitials: string }) {
  const isTml = side === "tml";
  return (
    <div className={`flex items-end gap-2 ${isTml ? "" : "flex-row-reverse"}`}>
      <LogoAvatar
        src={isTml ? "/tata-logo.svg" : supplierLogoUrl}
        fallback={isTml ? "TML" : supplierInitials}
        bgClass={isTml ? "bg-blue-900" : "bg-violet-700"}
      />
      <div className={`border rounded-xl px-4 py-3 shadow-sm flex items-center gap-1.5 ${isTml ? "bg-blue-50 border-blue-100" : "bg-white border-ink-200"}`}>
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isTml ? "bg-blue-400" : "bg-violet-400"}`} style={{ animationDelay: "0ms" }} />
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isTml ? "bg-blue-400" : "bg-violet-400"}`} style={{ animationDelay: "150ms" }} />
        <span className={`w-1.5 h-1.5 rounded-full animate-bounce ${isTml ? "bg-blue-400" : "bg-violet-400"}`} style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );
}

function TurnView({
  turn,
  response,
  variantNames,
  supplierName,
  supplierLogoUrl,
}: {
  turn: Turn;
  response: Response | undefined;
  isSupplierViewer: boolean;
  variantNames: string[];
  supplierName: string;
  supplierLogoUrl: string | null | undefined;
}) {
  if (turn.authorRole === "system") {
    return (
      <div className="flex justify-center">
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5 max-w-md text-center">
          {turn.content}
        </div>
      </div>
    );
  }

  const isTmlSide = turn.authorRole === "tml_agent" || turn.authorRole === "tml_user";
  const isAgent = turn.authorRole === "tml_agent" || turn.authorRole === "supplier_agent";
  const isHuman = !isAgent;
  const superseded = !!turn.supersededById;

  const mentionedVariant = !isTmlSide
    ? variantNames.find((n) => turn.content.toLowerCase().includes(n.toLowerCase())) ?? null
    : null;
  const mentionedVariantIdx = mentionedVariant ? variantNames.indexOf(mentionedVariant) : -1;

  const align = isTmlSide ? "items-start" : "items-end";
  const bubbleColor = isTmlSide
    ? "bg-blue-50 text-blue-900 border-blue-100"
    : "bg-white text-ink-800 border-ink-200";

  const avatarFallback = isAgent
    ? isTmlSide
      ? "TML"
      : mentionedVariant
      ? mentionedVariant.slice(0, 2).toUpperCase()
      : supplierName.slice(0, 2).toUpperCase()
    : (turn.user?.fullName ?? turn.user?.email ?? "?").slice(0, 2).toUpperCase();
  const avatarSrc = isAgent
    ? isTmlSide
      ? "/tata-logo.svg"
      : supplierLogoUrl
    : null;
  const avatarBgClass = isTmlSide ? "bg-blue-900" : "bg-violet-700";

  let nameLabel = "";
  if (turn.authorRole === "tml_agent") nameLabel = "Vishwakarma";
  else if (turn.authorRole === "supplier_agent") {
    nameLabel = mentionedVariant
      ? `Anveshak · ${mentionedVariant}`
      : `Anveshak · ${supplierName}`;
  } else {
    nameLabel = turn.user?.fullName ?? turn.user?.email ?? "Human";
  }

  const paramTag = response?.parameter?.key ?? (turn.parameterId ? "…" : null);

  return (
    <div className={`flex flex-col ${align}`}>
      <div className={`flex gap-2 max-w-[86%] ${isTmlSide ? "" : "flex-row-reverse"}`}>
        {/* Avatar */}
        <LogoAvatar
          src={avatarSrc}
          fallback={mentionedVariantIdx >= 0 ? avatarFallback : avatarFallback}
          bgClass={mentionedVariantIdx >= 0 ? `bg-ink-100 ${vc(mentionedVariantIdx).text}` : avatarBgClass}
          dim={superseded}
        />

        <div className="flex-1 min-w-0">
          {/* Name + time + param tag */}
          <div className={`flex items-center gap-2 mb-1 flex-wrap ${isTmlSide ? "" : "justify-end"}`}>
            {isHuman && (
              <span className="bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded-full font-medium">human</span>
            )}
            <span className="text-xs font-medium text-ink-700">{nameLabel}</span>
            {paramTag && (
              <span className="text-[9px] font-mono bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded">{paramTag}</span>
            )}
            <span className="text-[10px] text-ink-400">
              {new Date(turn.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>

          {/* Bubble */}
          <div
            className={`rounded-xl px-3.5 py-2.5 text-sm leading-relaxed border shadow-sm ${bubbleColor} ${
              superseded ? "opacity-50" : ""
            } ${isHuman ? "border-dashed" : ""}`}
          >
            {turn.content}
          </div>

          {/* Documents */}
          {turn.documents && turn.documents.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {turn.documents.map((d) => (
                <div
                  key={d.id}
                  className={`flex items-center gap-2 text-xs px-2 py-1 bg-ink-50 rounded-md max-w-fit ${isTmlSide ? "" : "ml-auto"}`}
                >
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">DOC</span>
                  <span className="text-ink-600">{d.filename}</span>
                </div>
              ))}
            </div>
          )}

          {/* Citations */}
          {turn.citations && turn.citations.length > 0 && (
            <p className={`text-[10px] text-ink-400 mt-1 ${isTmlSide ? "" : "text-right"}`}>
              cited: {turn.citations.map((c) => c.filename).join(", ")}
            </p>
          )}

          {superseded && (
            <p className={`text-[10px] text-ink-400 mt-1 italic ${isTmlSide ? "" : "text-right"}`}>
              superseded
            </p>
          )}
        </div>
      </div>

      {/* Verdict row */}
      {response && turn.authorRole === "supplier_agent" && !superseded && (
        <div
          className={`max-w-[86%] mt-1.5 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ${
            response.verdict === "pass"
              ? "bg-green-50 border border-green-100"
              : response.verdict === "fail"
              ? "bg-red-50 border border-red-100"
              : "bg-ink-50 border border-ink-100"
          } ${isTmlSide ? "self-start ml-9" : "self-end mr-9"}`}
        >
          {response.verdict === "pass" ? (
            <span className="text-green-600 font-medium">✓ Pass</span>
          ) : response.verdict === "fail" ? (
            <span className="text-red-600 font-medium">✕ Fail</span>
          ) : (
            <span className="text-amber-600 font-medium capitalize">{response.verdict.replace("_", " ")}</span>
          )}
          <span className="text-ink-500 flex-1">{response.rationale}</span>
          <span className="text-ink-400 flex-shrink-0">{response.evaluatedBy}</span>
        </div>
      )}
    </div>
  );
}
