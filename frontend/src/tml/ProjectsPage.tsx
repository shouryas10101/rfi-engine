import { useEffect, useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

type Project = {
  id: string;
  name: string;
  vehicleType: string;
  targetMarket: string | null;
  _count: { rfis: number; bidlist: number };
};

export default function ProjectsPage() {
  const nav = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", vehicleType: "", sop: "", targetMarket: "",
    milestoneKO: "", milestoneDR0: "", milestoneDR1: "",
    milestoneDR2: "", milestoneDR3: "", milestoneDR4: "", milestoneDR5: "",
  });

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
      const ms = (v: string) => v ? new Date(v).toISOString() : undefined;
      await api.post("/projects", {
        name: form.name.trim(),
        vehicleType: form.vehicleType.trim(),
        sop: ms(form.sop),
        targetMarket: form.targetMarket.trim() || undefined,
        milestoneKO:  ms(form.milestoneKO),
        milestoneDR0: ms(form.milestoneDR0),
        milestoneDR1: ms(form.milestoneDR1),
        milestoneDR2: ms(form.milestoneDR2),
        milestoneDR3: ms(form.milestoneDR3),
        milestoneDR4: ms(form.milestoneDR4),
        milestoneDR5: ms(form.milestoneDR5),
      });
      setForm({ name: "", vehicleType: "", sop: "", targetMarket: "", milestoneKO: "", milestoneDR0: "", milestoneDR1: "", milestoneDR2: "", milestoneDR3: "", milestoneDR4: "", milestoneDR5: "" });
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
              <input className="input" placeholder="e.g. Harrier EV — Front Brake Module" value={form.name} onChange={field("name")} required />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">Vehicle type *</label>
              <input className="input" placeholder="e.g. SUV (electric)" value={form.vehicleType} onChange={field("vehicleType")} required />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">Target market</label>
              <input className="input" placeholder="e.g. India + EU" value={form.targetMarket} onChange={field("targetMarket")} />
            </div>
            <div>
              <label className="block text-xs text-ink-400 mb-1">SOP date</label>
              <input className="input" type="date" value={form.sop} onChange={field("sop")} />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-ink-500 mb-2">Project milestones</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(["milestoneKO", "milestoneDR0", "milestoneDR1", "milestoneDR2", "milestoneDR3", "milestoneDR4", "milestoneDR5"] as const).map((key) => (
                <div key={key}>
                  <label className="block text-xs text-ink-400 mb-1">{key === "milestoneKO" ? "KO" : key.replace("milestone", "").replace("DR", "DR ")}</label>
                  <input className="input text-sm" type="date" value={form[key]} onChange={field(key)} />
                </div>
              ))}
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

      {projects.length === 0 && !showForm && (
        <p className="text-sm text-ink-400">No projects yet. Click + New project to get started.</p>
      )}
      {projects.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-xs text-ink-400">Select a project to open</label>
          <select
            className="input w-full max-w-lg"
            defaultValue=""
            onChange={(e) => { if (e.target.value) nav(`/projects/${e.target.value}`); }}
          >
            <option value="" disabled>Choose project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.vehicleType}{p.targetMarket ? ` · ${p.targetMarket}` : ""} ({p._count.rfis} RFIs, {p._count.bidlist} suppliers)
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
