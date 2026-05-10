import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

type Project = {
  id: string;
  name: string;
  vehicleType: string;
  targetMarket: string | null;
  _count: { rfis: number; bidlist: number };
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", vehicleType: "", sop: "", targetMarket: "" });

  async function load() {
    const r = await api.get("/projects");
    setProjects(r.data.projects);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  function field(key: keyof typeof form) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((prev: typeof form) => ({ ...prev, [key]: e.target.value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.vehicleType.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/projects", {
        name: form.name.trim(),
        vehicleType: form.vehicleType.trim(),
        sop: form.sop ? new Date(form.sop).toISOString() : undefined,
        targetMarket: form.targetMarket.trim() || undefined,
      });
      setForm({ name: "", vehicleType: "", sop: "", targetMarket: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error ?? "create_failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-ink-400">Loading projects...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Projects</h1>
          <p className="text-sm text-ink-400 mt-1">RFIs and supplier bid lists by vehicle programme</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">
          {showForm ? "Cancel" : "+ New project"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card mb-6 space-y-4">
          <h2 className="text-sm font-medium">New project</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-ink-400 mb-1">Project name *</label>
              <input
                className="input"
                placeholder="e.g. Harrier EV — Front Brake Module"
                value={form.name}
                onChange={field("name")}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">Vehicle type *</label>
              <input
                className="input"
                placeholder="e.g. SUV (electric)"
                value={form.vehicleType}
                onChange={field("vehicleType")}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">SOP date</label>
              <input
                className="input"
                type="date"
                value={form.sop}
                onChange={field("sop")}
              />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">Target market</label>
              <input
                className="input"
                placeholder="e.g. India + EU"
                value={form.targetMarket}
                onChange={field("targetMarket")}
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error.replace(/_/g, " ")}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={submitting || !form.name.trim() || !form.vehicleType.trim()} className="btn-primary">
              {submitting ? "Creating..." : "Create project"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {projects.length === 0 && !showForm && (
          <p className="text-sm text-ink-400 col-span-2">No projects yet. Click + New project to get started.</p>
        )}
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/projects/${p.id}`}
            className="card hover:border-accent-400 transition"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{p.name}</h3>
                <p className="text-sm text-ink-400 mt-1">
                  {p.vehicleType}{p.targetMarket ? ` · ${p.targetMarket}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-ink-400">
              <span>{p._count.rfis} RFI{p._count.rfis === 1 ? "" : "s"}</span>
              <span>{p._count.bidlist} supplier{p._count.bidlist === 1 ? "" : "s"}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
