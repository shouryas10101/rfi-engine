import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

type Supplier = {
  id: string;
  name: string;
  contactEmail: string;
  _count: { users: number; catalogue: number };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  link: string | null;
  supplierId: string | null;
};

export default function SuppliersPage() {
  const nav = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [latestInvite, setLatestInvite] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [s, i] = await Promise.all([api.get("/suppliers"), api.get("/invitations")]);
    setSuppliers(s.data.suppliers);
    setInvitations(i.data.invitations);
  }

  useEffect(() => {
    load();
  }, []);

  async function addSupplier(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const supResp = await api.post("/suppliers", { name, contactEmail: email });
      const supplierId = supResp.data.supplier.id;
      const invResp = await api.post("/invitations", {
        email,
        role: "SUPPLIER_ENGINEER",
        supplierId,
      });
      setLatestInvite(invResp.data.invitation);
      setShowAdd(false);
      setName("");
      setEmail("");
      await load();
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error?.replace(/_/g, " ") ?? "Failed to add supplier.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeInvite(id: string) {
    await api.post(`/invitations/${id}/revoke`);
    await load();
  }

  function copyLink(link: string) {
    navigator.clipboard.writeText(link);
  }

  const pendingInvites = invitations.filter((i) => i.status === "pending");

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium">Suppliers</h1>
          <p className="text-sm text-ink-400 mt-1">
            Add suppliers and invite their engineers to participate in RFI sessions.
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add supplier</button>
      </div>

      {showAdd && (
        <form onSubmit={addSupplier} className="card mb-4 space-y-3">
          <h2 className="text-sm font-medium">Add supplier</h2>
          <div>
            <label className="label">Supplier name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">First engineer email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Adding..." : "Add and invite"}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
          </div>
        </form>
      )}

      {latestInvite && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-6">
          <div className="flex items-start justify-between mb-2">
            <p className="text-sm font-medium text-green-900">
              Invitation created — share this link with the supplier engineer
            </p>
            <button onClick={() => setLatestInvite(null)} className="text-xs text-green-900">×</button>
          </div>
          <div className="flex items-center gap-2 bg-white rounded-md px-3 py-2 border border-green-200">
            <code className="text-xs flex-1 truncate">{latestInvite.link}</code>
            <button onClick={() => copyLink(latestInvite.link!)} className="btn-secondary text-xs">Copy</button>
          </div>
          <p className="text-xs text-green-800 mt-2">
            Send to: {latestInvite.email} · expires {new Date(latestInvite.expiresAt).toLocaleString()}
          </p>
        </div>
      )}

      <h2 className="text-xs font-medium uppercase tracking-wide text-ink-400 mb-2">Active suppliers</h2>
      {suppliers.length === 0 && <p className="text-sm text-ink-400 mb-4">No suppliers yet.</p>}
      {suppliers.length > 0 && (
        <div className="space-y-1.5 mb-6">
          <label className="block text-xs text-ink-400">Select a supplier to manage</label>
          <select
            className="input w-full max-w-lg"
            defaultValue=""
            onChange={(e) => { if (e.target.value) nav(`/suppliers/${e.target.value}`); }}
          >
            <option value="" disabled>Choose supplier...</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.contactEmail} · {s._count.users} engineer{s._count.users === 1 ? "" : "s"}, {s._count.catalogue} catalogue item{s._count.catalogue === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </div>
      )}

      {pendingInvites.length > 0 && (
        <>
          <h2 className="text-xs font-medium uppercase tracking-wide text-ink-400 mb-2">Pending invitations</h2>
          <div className="card divide-y divide-ink-100">
            {pendingInvites.map((inv) => (
              <div key={inv.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                <div>
                  <p className="text-sm">{inv.email}</p>
                  <p className="text-xs text-ink-400">
                    {inv.role.replace(/_/g, " ").toLowerCase()} · expires {new Date(inv.expiresAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {inv.link && (
                    <button onClick={() => copyLink(inv.link!)} className="btn-secondary text-xs">Copy link</button>
                  )}
                  <button onClick={() => revokeInvite(inv.id)} className="btn-secondary text-xs text-red-600">Revoke</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
