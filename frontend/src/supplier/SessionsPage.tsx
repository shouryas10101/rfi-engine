import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

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
  const nav = useNavigate();
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
        <p className="text-sm text-ink-400">No sessions match.</p>
      )}

      {filtered.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-xs text-ink-400">Select a session to open</label>
          <select
            className="input w-full max-w-lg"
            defaultValue=""
            onChange={(e) => { if (e.target.value) nav(`/sessions/${e.target.value}`); }}
          >
            <option value="" disabled>Choose session...</option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rfi.title} — {s.rfi.project.name}{!isSupplier ? ` · ${s.supplier.name}` : ""} [{s.status}]
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
