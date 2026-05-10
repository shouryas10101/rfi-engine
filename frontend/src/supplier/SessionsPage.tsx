import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { PhaseBadge, StatusBadge } from "../components/Badges";

type SessionRow = {
  id: string;
  currentPhase: string;
  status: string;
  startedAt: string;
  rfi: { id: string; title: string; componentCategory: string; project: { name: string } };
  supplier: { id: string; name: string };
  _count: { responses: number; turns: number };
};

export default function SessionsPage() {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/sessions").then((r) => {
      setSessions(r.data.sessions);
      setLoading(false);
    });
  }, []);

  const isSupplier = user?.role === "SUPPLIER_ENGINEER";

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          s.rfi.title.toLowerCase().includes(q) ||
          s.rfi.project.name.toLowerCase().includes(q) ||
          s.rfi.componentCategory.toLowerCase().includes(q) ||
          s.supplier.name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sessions, statusFilter, search]);

  if (loading) return <div className="text-ink-400">Loading sessions...</div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-medium">{isSupplier ? "My sessions" : "Sessions"}</h1>
        <p className="text-sm text-ink-400 mt-1">
          {isSupplier
            ? "RFIs you've been invited to. Click an active or pending session to participate."
            : "All supplier sessions. Active and historical."}
        </p>
      </div>

      <div className="flex gap-3 mb-4">
        <input
          className="input flex-1 text-sm"
          placeholder="Search by RFI, project, supplier, component..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input text-sm w-44"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="completed">Completed</option>
          <option value="failed_veto">Failed veto</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="card text-sm text-ink-400">No sessions match.</div>
      )}

      <div className="space-y-2">
        {filtered.map((s) => (
          <Link
            key={s.id}
            to={`/sessions/${s.id}`}
            className="card flex items-center justify-between hover:border-accent-400 transition"
          >
            <div className="min-w-0 flex-1">
              <h3 className="font-medium text-sm truncate">{s.rfi.title}</h3>
              <p className="text-xs text-ink-400 mt-1">
                {s.rfi.project.name} · {s.supplier.name} · {s._count.responses} answered, {s._count.turns} messages
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <PhaseBadge phase={s.currentPhase} />
              <StatusBadge status={s.status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
