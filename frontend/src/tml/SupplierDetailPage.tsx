import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { DocumentList } from "../components/DocumentList";

type CatalogueItem = {
  id: string;
  componentCategory: string;
  productCode: string;
  parameters: Record<string, unknown>;
  documents: { id: string; filename: string; mimeType: string; sizeBytes: number; extractionStatus: string }[];
};

type Supplier = {
  id: string;
  name: string;
  contactEmail: string;
  users: { id: string; email: string; fullName: string | null }[];
  catalogue: CatalogueItem[];
};

export default function SupplierDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [latestLink, setLatestLink] = useState<string | null>(null);

  async function deleteSupplier() {
    if (!window.confirm(`Delete supplier "${supplier?.name}"? This cannot be undone.`)) return;
    await api.delete(`/suppliers/${id}`);
    nav("/suppliers");
  }

  async function load() {
    const r = await api.get(`/suppliers/${id}`);
    setSupplier(r.data.supplier);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function inviteEngineer(e: FormEvent) {
    e.preventDefault();
    const r = await api.post("/invitations", {
      email: inviteEmail,
      role: "SUPPLIER_ENGINEER",
      supplierId: id,
    });
    setLatestLink(r.data.invitation.link);
    setInviteEmail("");
    setShowInvite(false);
  }

  if (!supplier) return <div className="text-ink-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6">
        <Link to="/suppliers" className="text-sm text-ink-400 hover:text-ink-600">← Suppliers</Link>
        <div className="flex items-start justify-between mt-2">
          <div>
            <h1 className="text-xl font-medium">{supplier.name}</h1>
            <p className="text-sm text-ink-400">{supplier.contactEmail}</p>
          </div>
          <button onClick={deleteSupplier} className="text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-md px-3 py-1.5 transition-colors">
            Delete supplier
          </button>
        </div>
      </div>

      {latestLink && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-4">
          <p className="text-sm font-medium text-green-900 mb-2">Invitation link</p>
          <div className="flex items-center gap-2 bg-white rounded-md px-3 py-2 border border-green-200">
            <code className="text-xs flex-1 truncate">{latestLink}</code>
            <button onClick={() => navigator.clipboard.writeText(latestLink)} className="btn-secondary text-xs">Copy</button>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400">Engineers</h2>
            <button onClick={() => setShowInvite(true)} className="btn-secondary text-xs">+ Invite engineer</button>
          </div>
          {showInvite && (
            <form onSubmit={inviteEngineer} className="card mb-3 space-y-2">
              <input
                className="input text-sm"
                type="email"
                placeholder="engineer@supplier.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                autoFocus
              />
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-xs">Invite</button>
                <button type="button" onClick={() => setShowInvite(false)} className="btn-secondary text-xs">Cancel</button>
              </div>
            </form>
          )}
          <div className="card divide-y divide-ink-100">
            {supplier.users.length === 0 && <p className="text-sm text-ink-400">No engineers yet.</p>}
            {supplier.users.map((u) => (
              <div key={u.id} className="py-2 first:pt-0 last:pb-0 text-sm">
                <p className="font-medium">{u.fullName ?? u.email}</p>
                <p className="text-xs text-ink-400">{u.email}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-ink-400 mb-3">Catalogue items</h2>
          {supplier.catalogue.length === 0 && (
            <div className="card text-sm text-ink-400">
              <p>No catalogue items.</p>
              <p className="text-xs mt-2">The supplier engineer manages these from their console.</p>
            </div>
          )}
          {supplier.catalogue.map((c) => (
            <div key={c.id} className="card mb-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">{c.productCode}</p>
                <span className="text-xs text-ink-400">{c.componentCategory}</span>
              </div>
              <details className="text-xs mb-3">
                <summary className="cursor-pointer text-ink-400 hover:text-ink-600">Parameters ({Object.keys(c.parameters).length})</summary>
                <pre className="mt-2 bg-ink-50 p-2 rounded-md overflow-x-auto">{JSON.stringify(c.parameters, null, 2)}</pre>
              </details>
              <DocumentList documents={c.documents} readOnly />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
