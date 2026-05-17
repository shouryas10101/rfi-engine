import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import { Breadcrumb } from "../components/Breadcrumb";

type Verdict = "pass" | "fail" | "partial" | "not_applicable";

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

type ReportPayload = {
  schemaVersion: string;
  generatedAt: string;
  meta: {
    project: { name: string; vehicleType: string; targetMarket: string | null };
    rfi: { id: string; title: string; componentCategory: string };
    supplier: { id: string; name: string; contactEmail: string };
    session: { id: string; status: string; startedAt: string; completedAt: string | null };
  };
  summary: {
    totalParameters: number;
    byVerdict: Record<Verdict, number>;
    mustHavePassRate: number;
    goodToHavePassRate: number;
    overallStatus: "compliant" | "partially_compliant" | "non_compliant";
    averageModificationDistance: number;
    deterministicCount: number;
    llmCount: number;
  };
  variants?: {
    recommended: {
      productCode: string;
      mhPassed: number;
      mhTotal: number;
      gthMatched: number;
      gthTotal: number;
      reason: string;
    } | null;
    all: VariantStatus[];
  };
  sections: {
    phase: string;
    importance: string;
    rows: {
      key: string;
      label: string;
      response: string;
      verdict: Verdict;
      rationale: string;
      confidence: number;
      modificationDistance: number;
      evaluatedBy: string;
    }[];
  }[];
};

function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function avgConfidence(payload: ReportPayload): string {
  const rows = payload.sections.flatMap((s) => s.rows);
  if (rows.length === 0) return "—";
  const avg = rows.reduce((sum, r) => sum + r.confidence, 0) / rows.length;
  return `${(avg * 100).toFixed(0)}%`;
}

const PHASE_META: Record<string, { label: string; dot: string; rowCount: (p: ReportPayload) => string }> = {
  general:      { label: "General",       dot: "bg-ink-400",    rowCount: () => "" },
  must_have:    { label: "Must-have",     dot: "bg-red-500",    rowCount: () => "" },
  good_to_have: { label: "Good-to-have",  dot: "bg-blue-500",   rowCount: () => "" },
  subjective:   { label: "Subjective",    dot: "bg-purple-500", rowCount: () => "" },
};

function VerdictCell({ verdict }: { verdict: Verdict }) {
  if (verdict === "pass") return <span className="inline-flex items-center gap-1 text-green-700 font-medium text-xs"><span className="text-green-500">✓</span> Pass</span>;
  if (verdict === "fail") return <span className="inline-flex items-center gap-1 text-red-700 font-medium text-xs"><span className="text-red-500">✕</span> Fail</span>;
  if (verdict === "partial") return <span className="inline-flex items-center gap-1 text-amber-700 font-medium text-xs">Partial</span>;
  return <span className="text-ink-400 text-xs">N/A</span>;
}

const OVERALL_STYLE: Record<string, { bg: string; text: string; icon: string; label: string }> = {
  compliant:           { bg: "bg-green-50 border-green-200",  text: "text-green-700",  icon: "✓", label: "Pass"    },
  partially_compliant: { bg: "bg-amber-50 border-amber-200",  text: "text-amber-700",  icon: "~", label: "Partial" },
  non_compliant:       { bg: "bg-red-50 border-red-200",      text: "text-red-700",    icon: "✕", label: "Fail"   },
};

export default function ReportPage() {
  const { id } = useParams();
  const [payload, setPayload] = useState<ReportPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/sessions/${id}/report`)
      .then((r) => setPayload(r.data.report.payload))
      .catch((e: { response?: { data?: { error?: string } } }) => {
        setError(e.response?.data?.error ?? "failed_to_load");
      });
  }, [id]);

  if (error) {
    return (
      <div className="card text-sm text-ink-600">
        <p>Report not available: <span className="text-red-600">{error.replace(/_/g, " ")}</span></p>
        <p className="text-xs text-ink-400 mt-1">A report is generated automatically when the session completes or fails veto.</p>
      </div>
    );
  }
  if (!payload) {
    return <div className="text-ink-400 text-sm">Loading report...</div>;
  }

  const overall = OVERALL_STYLE[payload.summary.overallStatus] ?? OVERALL_STYLE.non_compliant;

  function downloadPdf() {
    window.print();
  }

  const sessionShortId = payload.meta.session.id.slice(-8);

  return (
    <div className="max-w-5xl mx-auto">
      <Breadcrumb items={[
        { label: "Sessions", to: "/sessions" },
        { label: `${payload.meta.rfi.title} — ${payload.meta.supplier.name}`, to: `/sessions/${payload.meta.session.id}` },
        { label: "Report" },
      ]} />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-ink-400 mb-1">Compliance report</p>
          <h1 className="text-2xl font-bold text-ink-900">
            {payload.meta.supplier.name} · {payload.meta.rfi.title}
          </h1>
          <p className="text-sm text-ink-400 mt-1">
            Generated {new Date(payload.generatedAt).toLocaleString()} · Session {sessionShortId}
          </p>
        </div>
        <button
          onClick={downloadPdf}
          className="flex items-center gap-2 btn-secondary flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className={`rounded-xl border p-4 ${overall.bg}`}>
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-2">Verdict</p>
          <p className={`text-2xl font-bold ${overall.text}`}>{overall.icon} {overall.label}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-2">Pass rate</p>
          <p className="text-2xl font-bold text-ink-900">{pct(payload.summary.mustHavePassRate)}</p>
          <p className="text-xs text-ink-400 mt-0.5">must-have</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-2">Parameters</p>
          <p className="text-2xl font-bold text-ink-900">{payload.summary.totalParameters}</p>
          <div className="flex gap-2 mt-1">
            <span className="text-xs text-green-600">{payload.summary.byVerdict.pass} pass</span>
            <span className="text-xs text-red-600">{payload.summary.byVerdict.fail} fail</span>
          </div>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white p-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-2">Avg confidence</p>
          <p className="text-2xl font-bold text-ink-900">{avgConfidence(payload)}</p>
          <p className="text-xs text-ink-400 mt-0.5">
            {payload.summary.deterministicCount} det. / {payload.summary.llmCount} LLM
          </p>
        </div>
      </div>

      {/* Variant recommendation */}
      {payload.variants && payload.variants.all.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400 mb-3">Catalogue variants</p>

          {payload.variants.recommended && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-4 flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0 mt-0.5">✓</div>
              <div>
                <p className="text-xs font-mono uppercase tracking-widest text-green-600 mb-0.5">Recommended variant</p>
                <p className="text-lg font-bold text-ink-900">{payload.variants.recommended.productCode}</p>
                <p className="text-sm text-ink-600 mt-0.5">{payload.variants.recommended.reason}</p>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-ink-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ink-50 border-b border-ink-200">
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400">Product code</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400">Status</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400">Must-have</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400">Good-to-have</th>
                  <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400">Eliminated at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {payload.variants.all.map((v) => {
                  const isRec = payload.variants?.recommended?.productCode === v.productCode;
                  return (
                    <tr key={v.productCode} className={v.status === "eliminated" ? "bg-red-50/30" : isRec ? "bg-green-50/40" : "bg-white"}>
                      <td className="px-4 py-3 font-mono text-sm font-medium text-ink-900">
                        {v.productCode}
                        {isRec && <span className="ml-2 text-[10px] font-sans font-semibold text-green-600 uppercase tracking-wide">Recommended</span>}
                      </td>
                      <td className="px-4 py-3">
                        {v.status === "active"
                          ? <span className="text-xs font-medium text-green-700">Active</span>
                          : <span className="text-xs font-medium text-red-600">Eliminated</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-ink-700">{v.mhPassed}/{v.mhTotal}</td>
                      <td className="px-4 py-3 text-sm text-ink-700">{v.gthMatched}/{v.gthTotal}</td>
                      <td className="px-4 py-3 text-xs text-ink-500">{v.eliminatedAt ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-8">
        {payload.sections.map((sec) => {
          const meta = PHASE_META[sec.phase];
          const answered = sec.rows.length;
          return (
            <div key={sec.phase}>
              {/* Section header */}
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${meta?.dot ?? "bg-ink-400"}`} />
                <span className="font-semibold text-ink-900">{meta?.label ?? sec.phase.replace("_", " ")}</span>
                <span className="text-xs text-ink-400">{answered}/{answered} answered</span>
              </div>

              {/* Table */}
              <div className="rounded-xl border border-ink-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-ink-50 border-b border-ink-200">
                      <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400 w-[22%]">Parameter</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400 w-[22%]">Supplier</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400 w-[10%]">Verdict</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400 w-[12%]">Eval by</th>
                      <th className="text-left px-4 py-2.5 text-[10px] font-mono uppercase tracking-wide text-ink-400">Rationale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {sec.rows.map((row) => (
                      <tr
                        key={row.key}
                        className={`group ${
                          row.verdict === "fail" ? "bg-red-50/40" : row.verdict === "partial" ? "bg-amber-50/40" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium text-ink-900 text-sm">{row.label}</p>
                          <p className="text-[10px] font-mono text-ink-400 mt-0.5">{row.key}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-sm text-ink-700 leading-relaxed">{row.response}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <VerdictCell verdict={row.verdict} />
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="text-xs text-ink-500 font-mono">{row.evaluatedBy}</span>
                          <p className="text-[10px] text-ink-400 mt-0.5">{pct(row.confidence)} conf.</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="text-xs text-ink-600 leading-relaxed">{row.rationale}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <p className="text-xs text-ink-400 mt-8 pb-4">
        Generated {new Date(payload.generatedAt).toLocaleString()} · schema {payload.schemaVersion} · {payload.meta.supplier.contactEmail}
      </p>
    </div>
  );
}
