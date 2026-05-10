import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const isTML = user?.role !== "SUPPLIER_ENGINEER";
  const location = useLocation();
  const [supplierName, setSupplierName] = useState<string | null>(null);

  // Chat page needs full-height edge-to-edge layout (not the report page)
  const isFullPage = /^\/sessions\/[^/]+$/.test(location.pathname);

  useEffect(() => {
    if (user?.role === "SUPPLIER_ENGINEER" && user.supplierId) {
      api.get(`/suppliers/${user.supplierId}`)
        .then((r) => setSupplierName(r.data.supplier.name))
        .catch(() => {});
    }
  }, [user?.supplierId, user?.role]);

  const displayName = user?.fullName ?? user?.email ?? "User";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  const orgLabel =
    user?.role === "TML_ADMIN" ? "Tata Motors · Admin"
    : user?.role === "TML_ENGINEER" ? "Tata Motors · Engineer"
    : `${supplierName ?? "Supplier"} · Engineer`;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? "bg-white text-ink-900 shadow-sm border border-ink-200/60"
        : "text-ink-500 hover:text-ink-800"
    }`;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="border-b border-ink-200 bg-white flex-shrink-0 h-14 z-10">
        <div className="px-5 h-full flex items-center gap-3">
          {/* Logo + Brand */}
          <div className="flex items-center gap-2.5 mr-1 flex-shrink-0">
            <div className="w-7 h-7 bg-ink-900 rounded-[6px] flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">S</span>
            </div>
            <span className="font-semibold text-sm text-ink-900">Samanvaya</span>
            <span className="text-ink-300 text-sm mx-0.5">·</span>
            <span className="text-ink-400 text-sm">RFI compliance</span>
          </div>

          {/* Nav tabs — pill container */}
          <nav className="flex items-center bg-ink-100 rounded-xl p-1 gap-0.5 ml-1">
            {isTML ? (
              <>
                <NavLink to="/projects" className={navLinkClass}>Projects</NavLink>
                <NavLink to="/suppliers" className={navLinkClass}>Suppliers</NavLink>
                <NavLink to="/sessions" className={navLinkClass}>Sessions</NavLink>
              </>
            ) : (
              <>
                <NavLink to="/sessions" className={navLinkClass}>My sessions</NavLink>
                <NavLink to="/catalogue" className={navLinkClass}>My catalogue</NavLink>
              </>
            )}
          </nav>

          <div className="flex-1" />

          {/* Search bar */}
          <div className="flex items-center gap-2 bg-ink-50 border border-ink-200 rounded-lg px-3 py-1.5 w-60 cursor-pointer hover:border-ink-300 transition-colors flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-ink-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M16.65 16.65A7.5 7.5 0 1 0 3 10.5a7.5 7.5 0 0 0 13.65 6.15z" />
            </svg>
            <span className="text-sm text-ink-400 flex-1 select-none">Search projects, RFIs...</span>
            <kbd className="bg-white border border-ink-200 rounded px-1.5 py-0.5 text-[10px] text-ink-400 font-mono flex-shrink-0">⌘K</kbd>
          </div>

          {/* Bell */}
          <button className="p-2 rounded-md hover:bg-ink-50 text-ink-400 hover:text-ink-600 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          </button>

          {/* User card */}
          <div className="flex items-center gap-2.5 bg-ink-100 rounded-xl px-3 py-1.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[13px] font-bold leading-none">{initials}</span>
            </div>
            <div className="leading-tight">
              <p className="text-xs font-semibold text-ink-900 truncate max-w-[130px]">{displayName}</p>
              <p className="text-[10px] text-ink-400">{orgLabel}</p>
            </div>
            <button onClick={logout} title="Sign out" className="text-ink-400 hover:text-ink-700 transition-colors ml-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {isFullPage ? (
          <Outlet />
        ) : (
          <div className="h-full overflow-auto">
            <div className="max-w-7xl mx-auto px-6 py-8">
              <Outlet />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
