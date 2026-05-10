import clsx from "clsx";

export function VerdictBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    pass:            "bg-green-100 text-green-700 border border-green-200",
    partial:         "bg-amber-100 text-amber-700 border border-amber-200",
    fail:            "bg-red-100 text-red-700 border border-red-200",
    not_applicable:  "bg-ink-100 text-ink-500 border border-ink-200",
  };
  const icons: Record<string, string> = {
    pass: "✓",
    fail: "✕",
  };
  const icon = icons[verdict];
  return (
    <span className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", styles[verdict] ?? styles.not_applicable)}>
      {icon && <span>{icon}</span>}
      {verdict === "not_applicable" ? "N/A" : verdict.replace("_", " ")}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: string }) {
  const styles: Record<string, string> = {
    general:      "bg-ink-100 text-ink-600 border border-ink-200",
    must_have:    "bg-red-100 text-red-700 border border-red-200",
    good_to_have: "bg-blue-100 text-blue-700 border border-blue-200",
    subjective:   "bg-purple-100 text-purple-700 border border-purple-200",
    completed:    "bg-green-100 text-green-700 border border-green-200",
    pending:      "bg-ink-100 text-ink-500 border border-ink-200",
  };
  const dots: Record<string, string> = {
    general:      "bg-ink-400",
    must_have:    "bg-red-500",
    good_to_have: "bg-blue-500",
    subjective:   "bg-purple-500",
    completed:    "bg-green-500",
  };
  const labels: Record<string, string> = {
    general:      "General",
    must_have:    "Must-have",
    good_to_have: "Good-to-have",
    subjective:   "Subjective",
    completed:    "Completed",
    pending:      "Pending",
  };
  const dot = dots[phase];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", styles[phase] ?? styles.general)}>
      {dot && <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)} />}
      {labels[phase] ?? phase.replace(/_/g, " ")}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:      "bg-blue-100 text-blue-700 border border-blue-200",
    completed:   "bg-green-100 text-green-700 border border-green-200",
    failed_veto: "bg-red-100 text-red-700 border border-red-200",
    paused:      "bg-amber-100 text-amber-700 border border-amber-200",
    pending:     "bg-ink-100 text-ink-600 border border-ink-200",
    abandoned:   "bg-ink-100 text-ink-500 border border-ink-200",
  };
  const dots: Record<string, string> = {
    active:      "bg-blue-500 animate-pulse",
    completed:   "bg-green-500",
    failed_veto: "bg-red-500",
    paused:      "bg-amber-500",
    pending:     "bg-ink-400",
    abandoned:   "bg-ink-300",
  };
  const labels: Record<string, string> = {
    active:      "Active",
    completed:   "Completed",
    failed_veto: "Failed (veto)",
    paused:      "Paused",
    pending:     "Pending",
    abandoned:   "Abandoned",
  };
  const dot = dots[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", styles[status] ?? styles.pending)}>
      {dot && <span className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)} />}
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}
