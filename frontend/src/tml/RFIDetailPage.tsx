import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { PhaseBadge, StatusBadge } from "../components/Badges";
import { DocumentList } from "../components/DocumentList";
import { Breadcrumb } from "../components/Breadcrumb";

type Parameter = {
  id: string;
  phase: string;
  importance: string;
  key: string;
  label: string;
  type: string;
  weight: number;
};

type DocSummary = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: string;
};

type RFI = {
  id: string;
  title: string;
  componentCategory: string;
  status: string;
  project: { id: string; name: string };
  parameters: Parameter[];
  sessions: { id: string; currentPhase: string; status: string; supplier: { id: string; name: string } }[];
  documents: DocSummary[];
};

export default function RFIDetailPage() {
  const { id } = useParams();
  const [rfi, setRfi] = useState<RFI | null>(null);

  async function load() {
    const r = await api.get(`/rfis/${id}`);
    setRfi(r.data.rfi);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function uploadDoc(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("rfiId", id!);
    await api.post("/documents/upload", fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    await load();
  }

  async function deleteDoc(docId: string) {
    await api.delete(`/documents/${docId}`);
    await load();
  }

  if (!rfi) return <div className="text-ink-400">Loading...</div>;

  const grouped = rfi.parameters.reduce<Record<string, Parameter[]>>((acc, p) => {
    (acc[p.phase] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <Breadcrumb items={[{ label: "Projects", to: "/projects" }, { label: rfi.project.name, to: `/projects/${rfi.project.id}` }, { label: rfi.title }]} />
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-xl font-medium">{rfi.title}</h1>
            <p className="text-sm text-ink-400">{rfi.componentCategory}</p>
          </div>
          <Link to={`/rfis/${rfi.id}/comparison`} className="btn-primary">
            Supplier comparison
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400 mb-3">RFI documents</h2>
            <div className="card">
              <DocumentList
                documents={rfi.documents}
                onUpload={uploadDoc}
                onDelete={deleteDoc}
                emptyText="No documents yet. Upload the RFI brief, drawings, or specs so agents can ground their questions."
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400 mb-3">Parameters by phase</h2>
            {(["general", "must_have", "good_to_have", "subjective"] as const).map((phase) => {
              const params = grouped[phase] ?? [];
              if (params.length === 0) return null;
              return (
                <div key={phase} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <PhaseBadge phase={phase} />
                    <span className="text-xs text-ink-400">{params.length} parameter{params.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="card divide-y divide-ink-100">
                    {params.map((p) => (
                      <div key={p.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="font-medium text-sm">{p.label}</p>
                        <p className="text-xs text-ink-400 mt-1">
                          {p.key} · {p.type} · weight {p.weight}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400 mb-3">Sessions</h2>
          <div className="space-y-2">
            {rfi.sessions.length === 0 && (
              <p className="text-sm text-ink-400">No sessions yet. Create a session from the project page.</p>
            )}
            {rfi.sessions.map((s) => (
              <div key={s.id} className="card">
                <div className="flex items-center justify-between">
                  <Link to={`/sessions/${s.id}`} className="flex-1 hover:opacity-80 transition">
                    <span className="font-medium text-sm">{s.supplier.name}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-ink-400">phase</span>
                      <PhaseBadge phase={s.currentPhase} />
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-3">
                    <StatusBadge status={s.status} />
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        if (!confirm(`Delete session with ${s.supplier.name}? This cannot be undone.`)) return;
                        await api.delete(`/sessions/${s.id}`);
                        await load();
                      }}
                      className="text-xs text-red-500 hover:text-red-700 btn-secondary"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
