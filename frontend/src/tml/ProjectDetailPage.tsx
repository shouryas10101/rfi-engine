import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Breadcrumb } from "../components/Breadcrumb";

type Supplier = { id: string; name: string; contactEmail: string };

type Project = {
  id: string;
  name: string;
  vehicleType: string;
  targetMarket: string | null;
  sop: string | null;
  milestoneKO:  string | null;
  milestoneDR0: string | null;
  milestoneDR1: string | null;
  milestoneDR2: string | null;
  milestoneDR3: string | null;
  milestoneDR4: string | null;
  milestoneDR5: string | null;
  rfis: { id: string; title: string; componentCategory: string; status: string; bidlist: { supplier: Supplier }[] }[];
};

// Supported parameter spec types matching backend ParameterSpecSchema
type ParamType = "boolean" | "numeric_range" | "numeric_exact" | "numeric_subset_range" | "enum" | "subjective" | "text";
type Phase = "general" | "must_have" | "good_to_have" | "subjective";

type ParamDraft = {
  key: string;
  label: string;
  phase: Phase;
  importance: string;
  type: ParamType;
  weight: number;
  ordering: number;
  // spec fields
  unit: string;
  min: string;
  max: string;
  value: string;
  tolerance: string;
  allowed: string; // comma-separated
  prompt: string;
  description: string;
  acceptanceCriteria: string;
  expectedBool: "true" | "false";
};

function emptyParam(ordering: number): ParamDraft {
  return {
    key: "", label: "", phase: "general", importance: "general",
    type: "text", weight: 1, ordering,
    unit: "", min: "", max: "", value: "", tolerance: "",
    allowed: "", prompt: "", description: "", acceptanceCriteria: "",
    expectedBool: "true",
  };
}

function phaseToImportance(phase: Phase): string {
  if (phase === "must_have") return "must";
  if (phase === "good_to_have") return "good";
  if (phase === "subjective") return "subjective";
  return "general";
}

function buildSpec(p: ParamDraft): Record<string, unknown> {
  switch (p.type) {
    case "boolean":
      return { type: "boolean", expected: p.expectedBool === "true" };
    case "numeric_range":
      return {
        type: "numeric_range",
        min: p.min !== "" ? Number(p.min) : null,
        max: p.max !== "" ? Number(p.max) : null,
        unit: p.unit,
      };
    case "numeric_exact":
      return {
        type: "numeric_exact",
        value: Number(p.value),
        unit: p.unit,
        tolerance: p.tolerance !== "" ? Number(p.tolerance) : 0,
      };
    case "numeric_subset_range":
      return {
        type: "numeric_subset_range",
        min: Number(p.min),
        max: Number(p.max),
        unit: p.unit,
      };
    case "enum":
      return {
        type: "enum",
        allowed: p.allowed.split(",").map((s) => s.trim()).filter(Boolean),
      };
    case "subjective":
      return {
        type: "subjective",
        description: p.description,
        acceptanceCriteria: p.acceptanceCriteria || undefined,
      };
    case "text":
      return {
        type: "text",
        prompt: p.prompt,
        ...(p.acceptanceCriteria ? { acceptanceCriteria: p.acceptanceCriteria } : {}),
      };
  }
}

function ParamRow({
  param,
  index,
  onChange,
  onRemove,
}: {
  param: ParamDraft;
  index: number;
  onChange: (index: number, updated: ParamDraft) => void;
  onRemove: (index: number) => void;
}) {
  function set<K extends keyof ParamDraft>(key: K) {
    return (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      const updated = { ...param, [key]: e.target.value };
      if (key === "phase") updated.importance = phaseToImportance(e.target.value as Phase);
      onChange(index, updated);
    };
  }

  return (
    <div className="border border-ink-200 rounded-md p-4 space-y-3 bg-ink-50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-400">Parameter {index + 1}</span>
        <button type="button" onClick={() => onRemove(index)} className="text-xs text-red-600 hover:text-red-800">Remove</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-ink-400 mb-1">Key (unique, snake_case) *</label>
          <input className="input text-sm" placeholder="e.g. max_braking_force_kn" value={param.key} onChange={set("key")} required />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Label (human-readable) *</label>
          <input className="input text-sm" placeholder="e.g. Maximum braking force (kN)" value={param.label} onChange={set("label")} required />
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Phase *</label>
          <select className="input text-sm" value={param.phase} onChange={set("phase")}>
            <option value="general">General</option>
            <option value="must_have">Must-have (veto)</option>
            <option value="good_to_have">Good-to-have</option>
            <option value="subjective">Subjective</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Type *</label>
          <select className="input text-sm" value={param.type} onChange={set("type")}>
            <option value="boolean">Boolean (yes/no)</option>
            <option value="numeric_range">Numeric range (min/max)</option>
            <option value="numeric_exact">Numeric exact value</option>
            <option value="numeric_subset_range">Numeric subset range</option>
            <option value="enum">Enum (list of values)</option>
            <option value="subjective">Subjective (LLM-graded)</option>
            <option value="text">Free text</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-400 mb-1">Weight</label>
          <input className="input text-sm" type="number" min="0.1" step="0.1" value={param.weight} onChange={set("weight")} />
        </div>
      </div>

      {/* Type-specific spec fields */}
      {param.type === "boolean" && (
        <div>
          <label className="block text-xs text-ink-400 mb-1">Expected answer</label>
          <select className="input text-sm w-40" value={param.expectedBool} onChange={set("expectedBool")}>
            <option value="true">Yes / true</option>
            <option value="false">No / false</option>
          </select>
        </div>
      )}

      {(param.type === "numeric_range" || param.type === "numeric_subset_range") && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-ink-400 mb-1">Min</label>
            <input className="input text-sm" type="number" placeholder="e.g. 28" value={param.min} onChange={set("min")} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Max</label>
            <input className="input text-sm" type="number" placeholder="e.g. 600" value={param.max} onChange={set("max")} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Unit</label>
            <input className="input text-sm" placeholder="e.g. kN" value={param.unit} onChange={set("unit")} />
          </div>
        </div>
      )}

      {param.type === "numeric_exact" && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-ink-400 mb-1">Value</label>
            <input className="input text-sm" type="number" placeholder="e.g. 12.5" value={param.value} onChange={set("value")} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Tolerance ±</label>
            <input className="input text-sm" type="number" placeholder="e.g. 0.5" value={param.tolerance} onChange={set("tolerance")} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Unit</label>
            <input className="input text-sm" placeholder="e.g. mm" value={param.unit} onChange={set("unit")} />
          </div>
        </div>
      )}

      {param.type === "enum" && (
        <div>
          <label className="block text-xs text-ink-400 mb-1">Allowed values (comma-separated)</label>
          <input className="input text-sm" placeholder='e.g. ECE-R13, FMVSS-135, AIS-018' value={param.allowed} onChange={set("allowed")} />
        </div>
      )}

      {param.type === "text" && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-ink-400 mb-1">Prompt</label>
            <input className="input text-sm" placeholder="What should the supplier describe?" value={param.prompt} onChange={set("prompt")} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">
              Acceptance criteria {param.phase === "must_have" && <span className="text-red-500">*</span>}
            </label>
            <input
              className="input text-sm"
              placeholder={param.phase === "must_have" ? "Required — what constitutes a pass?" : "Optional — what constitutes a pass?"}
              value={param.acceptanceCriteria}
              onChange={set("acceptanceCriteria")}
            />
          </div>
        </div>
      )}

      {param.type === "subjective" && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs text-ink-400 mb-1">Description</label>
            <textarea className="input text-sm min-h-[60px] resize-y" placeholder="Describe what to evaluate" value={param.description} onChange={set("description")} />
          </div>
          <div>
            <label className="block text-xs text-ink-400 mb-1">Acceptance criteria (optional)</label>
            <input className="input text-sm" placeholder="What constitutes a pass?" value={param.acceptanceCriteria} onChange={set("acceptanceCriteria")} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [addingToRfi, setAddingToRfi] = useState<string | null>(null);
  const [addSupplierPick, setAddSupplierPick] = useState("");
  const [creatingSessionFor, setCreatingSessionFor] = useState<string | null>(null);

  // Edit project state
  const [showEditForm, setShowEditForm] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", vehicleType: "", sop: "", targetMarket: "",
    milestoneKO: "", milestoneDR0: "", milestoneDR1: "",
    milestoneDR2: "", milestoneDR3: "", milestoneDR4: "", milestoneDR5: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // RFI creation state
  const [showRfiForm, setShowRfiForm] = useState(false);
  const [rfiTitle, setRfiTitle] = useState("");
  const [rfiCategory, setRfiCategory] = useState("");
  const [params, setParams] = useState<ParamDraft[]>([emptyParam(0)]);
  const [rfiSubmitting, setRfiSubmitting] = useState(false);
  const [rfiError, setRfiError] = useState<string | null>(null);
  const [rfiParsing, setRfiParsing] = useState(false);
  const [rfiParseNote, setRfiParseNote] = useState<string | null>(null);
  const [rfiParsedFile, setRfiParsedFile] = useState<File | null>(null);
  const rfiFileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [p, s] = await Promise.all([api.get(`/projects/${id}`), api.get("/suppliers")]);
    setProject(p.data.project);
    setAllSuppliers(s.data.suppliers);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const toDateInput = (iso: string | null) => iso ? iso.slice(0, 10) : "";

  function openEditForm() {
    if (!project) return;
    setEditForm({
      name: project.name,
      vehicleType: project.vehicleType,
      sop: toDateInput(project.sop),
      targetMarket: project.targetMarket ?? "",
      milestoneKO:  toDateInput(project.milestoneKO),
      milestoneDR0: toDateInput(project.milestoneDR0),
      milestoneDR1: toDateInput(project.milestoneDR1),
      milestoneDR2: toDateInput(project.milestoneDR2),
      milestoneDR3: toDateInput(project.milestoneDR3),
      milestoneDR4: toDateInput(project.milestoneDR4),
      milestoneDR5: toDateInput(project.milestoneDR5),
    });
    setEditError(null);
    setShowEditForm(true);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    setEditSubmitting(true);
    setEditError(null);
    try {
      const ms = (v: string) => v ? new Date(v).toISOString() : null;
      await api.patch(`/projects/${id}`, {
        name: editForm.name.trim(),
        vehicleType: editForm.vehicleType.trim(),
        sop: ms(editForm.sop),
        targetMarket: editForm.targetMarket.trim() || null,
        milestoneKO:  ms(editForm.milestoneKO),
        milestoneDR0: ms(editForm.milestoneDR0),
        milestoneDR1: ms(editForm.milestoneDR1),
        milestoneDR2: ms(editForm.milestoneDR2),
        milestoneDR3: ms(editForm.milestoneDR3),
        milestoneDR4: ms(editForm.milestoneDR4),
        milestoneDR5: ms(editForm.milestoneDR5),
      });
      setShowEditForm(false);
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setEditError(e2.response?.data?.error ?? "update_failed");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function addSupplierToRfi(rfiId: string) {
    if (!addSupplierPick) return;
    await api.post(`/rfis/${rfiId}/bidlist`, { supplierId: addSupplierPick });
    setAddSupplierPick("");
    setAddingToRfi(null);
    await load();
  }

  async function removeFromRfiBidlist(rfiId: string, supplierId: string) {
    await api.delete(`/rfis/${rfiId}/bidlist/${supplierId}`);
    await load();
  }

  async function deleteProject() {
    if (!window.confirm(`Delete project "${project?.name}" and all its RFIs? This cannot be undone.`)) return;
    await api.delete(`/projects/${id}`);
    nav("/projects");
  }

  async function deleteRfi(rfiId: string, rfiTitle: string) {
    if (!window.confirm(`Delete RFI "${rfiTitle}"? This cannot be undone.`)) return;
    await api.delete(`/rfis/${rfiId}`);
    await load();
  }

  async function createSession(rfiId: string, supplierId: string) {
    setCreatingSessionFor(`${rfiId}:${supplierId}`);
    try {
      const r = await api.post("/sessions", { rfiId, supplierId });
      nav(`/sessions/${r.data.session.id}`);
    } finally {
      setCreatingSessionFor(null);
    }
  }

  async function parseRfiFromFile(file: File) {
    setRfiParsing(true);
    setRfiParseNote(null);
    setRfiError(null);
    setRfiParsedFile(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api.post("/rfis/parse-file", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { parameters, note } = r.data as {
        parameters: {
          key: string; label: string; phase: string; importance: string;
          weight: number; ordering: number;
          spec: { type: string; min?: number; max?: number; unit?: string; value?: number;
                  tolerance?: number; allowed?: string[]; prompt?: string;
                  description?: string; acceptanceCriteria?: string; expected?: boolean };
        }[];
        note?: string;
      };
      if (note) {
        setRfiParseNote(note);
        return;
      }
      if (!parameters.length) {
        setRfiParseNote("No parameters could be extracted. Try a clearer document or add them manually.");
        return;
      }
      // Convert to ParamDraft format
      const drafts: ParamDraft[] = parameters.map((p, i) => {
        const spec = p.spec ?? {};
        const type = (spec.type ?? "text") as ParamDraft["type"];
        return {
          key: p.key,
          label: p.label,
          phase: (p.phase as ParamDraft["phase"]) ?? "general",
          importance: p.importance ?? "general",
          type,
          weight: p.weight ?? 1,
          ordering: i,
          unit: spec.unit ?? "",
          min: spec.min != null ? String(spec.min) : "",
          max: spec.max != null ? String(spec.max) : "",
          value: spec.value != null ? String(spec.value) : "",
          tolerance: spec.tolerance != null ? String(spec.tolerance) : "",
          allowed: Array.isArray(spec.allowed) ? spec.allowed.join(", ") : "",
          prompt: spec.prompt ?? "",
          description: spec.description ?? "",
          acceptanceCriteria: spec.acceptanceCriteria ?? "",
          expectedBool: spec.expected === false ? "false" : "true",
        };
      });
      setParams(drafts);
      setRfiParseNote(`Extracted ${drafts.length} parameter(s) from ${file.name}. Review below before creating the RFI.`);
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      setRfiError(e.response?.data?.error?.replace(/_/g, " ") ?? "File parsing failed");
      setRfiParsedFile(null);
    } finally {
      setRfiParsing(false);
      if (rfiFileInputRef.current) rfiFileInputRef.current.value = "";
    }
  }

  function addParam() {
    setParams((prev: ParamDraft[]) => [...prev, emptyParam(prev.length)]);
  }

  function updateParam(index: number, updated: ParamDraft) {
    setParams((prev: ParamDraft[]) => prev.map((p, i) => (i === index ? updated : p)));
  }

  function removeParam(index: number) {
    setParams((prev: ParamDraft[]) => prev.filter((_, i) => i !== index).map((p, i) => ({ ...p, ordering: i })));
  }

  async function submitRfi(e: FormEvent) {
    e.preventDefault();
    if (!rfiTitle.trim() || !rfiCategory.trim() || params.length === 0) return;
    setRfiSubmitting(true);
    setRfiError(null);
    try {
      const payload = {
        projectId: id,
        title: rfiTitle.trim(),
        componentCategory: rfiCategory.trim(),
        parameters: params.map((p, i) => ({
          key: p.key.trim(),
          label: p.label.trim(),
          phase: p.phase,
          importance: p.importance,
          weight: Number(p.weight),
          ordering: i,
          spec: buildSpec(p),
        })),
      };
      const r = await api.post("/rfis", payload);
      const newRfiId = r.data.rfi.id;
      if (rfiParsedFile) {
        const fd = new FormData();
        fd.append("file", rfiParsedFile);
        fd.append("rfiId", newRfiId);
        await api.post("/documents/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
        setRfiParsedFile(null);
      }
      setShowRfiForm(false);
      setRfiTitle("");
      setRfiCategory("");
      setParams([emptyParam(0)]);
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string; message?: string } } };
      setRfiError(e2.response?.data?.error ?? e2.response?.data?.message ?? "create_failed");
    } finally {
      setRfiSubmitting(false);
    }
  }

  if (!project) return <div className="text-ink-400">Loading...</div>;


  return (
    <div>
      <div className="mb-6">
        <Breadcrumb items={[{ label: "Projects", to: "/projects" }, { label: project.name }]} />
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-medium">{project.name}</h1>
            <p className="text-sm text-ink-400">
              {project.vehicleType}{project.targetMarket ? ` · ${project.targetMarket}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openEditForm} className="text-xs text-ink-500 hover:text-ink-800 border border-ink-200 hover:border-ink-400 rounded-md px-3 py-1.5 transition-colors">
              Edit details
            </button>
            <button onClick={deleteProject} className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-md px-3 py-1.5 transition-colors">
              Delete project
            </button>
          </div>
        </div>

        {/* Milestone timeline */}
        {(() => {
          const milestones = [
            { label: "KO",  date: project.milestoneKO },
            { label: "DR0", date: project.milestoneDR0 },
            { label: "DR1", date: project.milestoneDR1 },
            { label: "DR2", date: project.milestoneDR2 },
            { label: "DR3", date: project.milestoneDR3 },
            { label: "DR4", date: project.milestoneDR4 },
            { label: "DR5", date: project.milestoneDR5 },
          ].filter((m) => m.date);
          if (!milestones.length) return null;
          const today = new Date();
          return (
            <div className="mt-4 flex items-start gap-0 overflow-x-auto pb-1">
              {milestones.map((m, i) => {
                const d = new Date(m.date!);
                const past = d < today;
                return (
                  <div key={m.label} className="flex items-center">
                    {i > 0 && <div className={`h-px w-10 flex-shrink-0 mt-1 ${past ? "bg-ink-500" : "bg-ink-200"}`} />}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-3 h-3 rounded-full border-2 ${past ? "bg-ink-800 border-ink-800" : "bg-white border-ink-300"}`} />
                      <span className="text-[10px] font-semibold text-ink-700 mt-1 leading-none">{m.label}</span>
                      <span className="text-[9px] text-ink-400 leading-none mt-0.5">{d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {showEditForm && (
          <form onSubmit={saveEdit} className="mt-4 card space-y-4">
            <h2 className="text-sm font-medium">Edit project details</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-ink-400 mb-1">Project name *</label>
                <input className="input" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">Vehicle type *</label>
                <input className="input" value={editForm.vehicleType} onChange={(e) => setEditForm((f) => ({ ...f, vehicleType: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">Target market</label>
                <input className="input" value={editForm.targetMarket} onChange={(e) => setEditForm((f) => ({ ...f, targetMarket: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-ink-400 mb-1">SOP date</label>
                <input className="input" type="date" value={editForm.sop} onChange={(e) => setEditForm((f) => ({ ...f, sop: e.target.value }))} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-ink-500 mb-2">Project milestones</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(["milestoneKO", "milestoneDR0", "milestoneDR1", "milestoneDR2", "milestoneDR3", "milestoneDR4", "milestoneDR5"] as const).map((key) => (
                  <div key={key}>
                    <label className="block text-xs text-ink-400 mb-1">{key === "milestoneKO" ? "KO" : key.replace("milestone", "").replace("DR", "DR ")}</label>
                    <input className="input text-sm" type="date" value={editForm[key]} onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
            </div>
            {editError && <p className="text-xs text-red-600">{editError.replace(/_/g, " ")}</p>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowEditForm(false)} className="btn-secondary text-xs">Cancel</button>
              <button type="submit" disabled={editSubmitting} className="btn-primary text-xs">
                {editSubmitting ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400">RFIs</h2>
            <button onClick={() => { setShowRfiForm(!showRfiForm); if (showRfiForm) setRfiParsedFile(null); }} className="btn-secondary text-xs">
              {showRfiForm ? "Cancel" : "+ New RFI"}
            </button>
          </div>

          {showRfiForm && (
            <form onSubmit={submitRfi} className="card space-y-4 mb-4">
              <h3 className="text-sm font-medium">New RFI</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-ink-400 mb-1">RFI title *</label>
                  <input
                    className="input text-sm"
                    placeholder="e.g. Front Brake Caliper RFI — Harrier EV"
                    value={rfiTitle}
                    onChange={(e) => setRfiTitle(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-400 mb-1">Component category *</label>
                  <input
                    className="input text-sm"
                    placeholder="e.g. Brake Caliper"
                    value={rfiCategory}
                    onChange={(e) => setRfiCategory(e.target.value)}
                    required
                  />
                  <p className="text-xs text-ink-400 mt-1">Must match the supplier's catalogue item category exactly.</p>
                </div>
              </div>

              {/* Auto-extract from file */}
              <div className="border border-dashed border-ink-300 rounded-md p-4 bg-ink-50">
                <p className="text-sm font-medium mb-1">Auto-fill parameters from RFI document</p>
                <p className="text-xs text-ink-400 mb-3">
                  Upload your RFI specification (Excel or PDF) and AI will extract all requirements as structured parameters. You can review and edit each one before creating the RFI.
                </p>
                <input
                  ref={rfiFileInputRef}
                  type="file"
                  accept=".pdf,.xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) parseRfiFromFile(f); }}
                />
                <button
                  type="button"
                  onClick={() => rfiFileInputRef.current?.click()}
                  disabled={rfiParsing}
                  className="btn-secondary text-sm"
                >
                  {rfiParsing ? "Extracting parameters…" : "Upload RFI document to extract parameters"}
                </button>
                {rfiParseNote && <p className="text-xs text-accent-600 mt-2">{rfiParseNote}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-ink-600">Parameters ({params.length})</p>
                  <button type="button" onClick={addParam} className="btn-secondary text-xs">+ Add parameter</button>
                </div>
                <div className="space-y-3">
                  {params.map((p, i) => (
                    <ParamRow key={i} param={p} index={i} onChange={updateParam} onRemove={removeParam} />
                  ))}
                </div>
              </div>

              {rfiError && <p className="text-xs text-red-600">{String(rfiError).replace(/_/g, " ")}</p>}
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={rfiSubmitting || !rfiTitle.trim() || !rfiCategory.trim() || params.length === 0}
                  className="btn-primary"
                >
                  {rfiSubmitting ? "Creating..." : "Create RFI"}
                </button>
              </div>
            </form>
          )}

          {project.rfis.length === 0 && !showRfiForm && (
            <p className="text-sm text-ink-400">No RFIs yet. Click + New RFI to create one.</p>
          )}
          <div className="space-y-3">
            {project.rfis.map((rfi) => (
              <div key={rfi.id} className="card group">
                <div className="flex items-start justify-between">
                  <div>
                    <Link to={`/rfis/${rfi.id}`} className="font-medium text-ink-900 hover:text-accent-600 transition-colors">
                      {rfi.title}
                    </Link>
                    <p className="text-xs text-ink-400 mt-0.5">{rfi.componentCategory} · <span className="capitalize">{rfi.status}</span></p>
                  </div>
                  <button
                    onClick={() => deleteRfi(rfi.id, rfi.title)}
                    className="text-xs text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity ml-4 flex-shrink-0"
                  >
                    Delete
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-ink-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-ink-400">Bid list</p>
                    {allSuppliers.length > 0 && (
                      <button
                        onClick={() => { setAddingToRfi(addingToRfi === rfi.id ? null : rfi.id); setAddSupplierPick(""); }}
                        className="text-xs text-accent-600 hover:text-accent-800"
                      >
                        {addingToRfi === rfi.id ? "Cancel" : "+ Add supplier"}
                      </button>
                    )}
                  </div>
                  {addingToRfi === rfi.id && (
                    <div className="flex gap-2 mb-2">
                      <select
                        className="input text-xs flex-1"
                        value={addSupplierPick}
                        onChange={(e) => setAddSupplierPick(e.target.value)}
                      >
                        <option value="">Pick a supplier…</option>
                        {allSuppliers
                          .filter((s) => !rfi.bidlist.some((b) => b.supplier.id === s.id))
                          .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
                        }
                      </select>
                      <button
                        onClick={() => addSupplierToRfi(rfi.id)}
                        disabled={!addSupplierPick}
                        className="btn-primary text-xs"
                      >
                        Add
                      </button>
                    </div>
                  )}
                  {rfi.bidlist.length === 0 ? (
                    <p className="text-xs text-ink-400">{allSuppliers.length === 0 ? "No suppliers available." : "No suppliers added yet."}</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {rfi.bidlist.map((b) => {
                        const k = `${rfi.id}:${b.supplier.id}`;
                        return (
                          <div key={b.supplier.id} className="flex items-center gap-1">
                            <button
                              onClick={() => createSession(rfi.id, b.supplier.id)}
                              disabled={creatingSessionFor === k}
                              className="btn-secondary text-xs"
                            >
                              {creatingSessionFor === k ? "Opening…" : `→ ${b.supplier.name}`}
                            </button>
                            <button
                              onClick={() => removeFromRfiBidlist(rfi.id, b.supplier.id)}
                              className="text-ink-300 hover:text-red-500 text-xs leading-none"
                              title="Remove from bid list"
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
