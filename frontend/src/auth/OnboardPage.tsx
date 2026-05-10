import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, setToken, decodeJwt } from "../api/client";
import { useAuth } from "./AuthContext";

type InvitationInfo = {
  email: string;
  role: string;
  tenantName: string;
  supplierName: string | null;
  issuedByName: string;
  expiresAt: string;
};

export default function OnboardPage() {
  const { token } = useParams();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get(`/invitations/onboard/${token}`)
      .then((r) => setInfo(r.data.invitation))
      .catch(() => setError("This invitation link is invalid, expired, or already used."))
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const r = await api.post(`/invitations/onboard/${token}`, { fullName, password });
      setToken(r.data.token);
      const payload = decodeJwt<{ role: string }>(r.data.token);
      refresh();
      nav(payload?.role === "SUPPLIER_ENGINEER" ? "/sessions" : "/projects", { replace: true });
    } catch (err) {
      const e2 = err as { response?: { data?: { error?: string } } };
      setError(e2.response?.data?.error?.replace(/_/g, " ") ?? "Failed to create account.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-ink-400">Loading...</div>;

  if (error && !info) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card max-w-md w-full">
          <h1 className="text-lg font-medium mb-2">Invitation unavailable</h1>
          <p className="text-sm text-ink-400">{error}</p>
        </div>
      </div>
    );
  }
  if (!info) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <h1 className="text-xl font-medium mb-1">You're invited</h1>
        <p className="text-sm text-ink-400 mb-5">
          <span className="text-ink-900 font-medium">{info.tenantName}</span> has invited you
          {info.supplierName ? (
            <> as an engineer for <span className="text-ink-900 font-medium">{info.supplierName}</span></>
          ) : (
            <> as a {info.role.replace(/_/g, " ").toLowerCase()}</>
          )}.
        </p>
        <form onSubmit={onSubmit} className="card space-y-4">
          <div className="bg-ink-50 rounded-md p-3 text-xs">
            <p className="text-ink-400 uppercase tracking-wide mb-1">Invited by</p>
            <p>{info.issuedByName}</p>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input bg-ink-50 text-ink-400" value={info.email} disabled />
          </div>
          <div>
            <label className="label">Full name</label>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full" type="submit" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account and sign in"}
          </button>
          <p className="text-xs text-ink-400 text-center">
            This invitation expires {new Date(info.expiresAt).toLocaleString()}.
          </p>
        </form>
      </div>
    </div>
  );
}
