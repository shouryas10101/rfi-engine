import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Layout() {
  const { user, logout } = useAuth();
  const isTML = user?.role !== "SUPPLIER_ENGINEER";
  const location = useLocation();
  const [supplierName, setSupplierName] = useState<string | null>(null);
  const [supplierLogoUrl, setSupplierLogoUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  // Chat page needs full-height edge-to-edge layout (not the report page)
  const isFullPage = /^\/sessions\/[^/]+$/.test(location.pathname);

  useEffect(() => {
    if (user?.role === "SUPPLIER_ENGINEER" && user.supplierId) {
      api.get(`/suppliers/${user.supplierId}`)
        .then((r) => {
          setSupplierName(r.data.supplier.name);
          setSupplierLogoUrl(r.data.supplier.logoUrl ?? null);
          setLogoError(false);
        })
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

  const sideNavClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      isActive
        ? "bg-ink-900 text-white"
        : "text-ink-500 hover:bg-ink-100 hover:text-ink-800"
    }`;

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Header */}
      <header className="border-b border-ink-200 bg-white flex-shrink-0 h-[68px] z-10">
        <div className="px-6 h-full flex items-center gap-4">
          {/* Logo + Brand */}
          <div className="flex items-center gap-3 mr-2 flex-shrink-0">
            <div className="w-14 h-14 rounded-[8px] overflow-hidden flex items-center justify-center">
              <img src="/tata-logo.svg" alt="Tata" className="w-full h-full object-contain" />
            </div>
            <div className="leading-tight">
              <span className="font-bold text-base text-ink-900 tracking-tight">Setu</span>
              <p className="text-xs text-ink-400 leading-none mt-0.5">RFI compliance</p>
            </div>
          </div>

          <div className="flex-1" />

          {/* Search bar */}
          <div className="flex items-center gap-2.5 bg-ink-50 border border-ink-200 rounded-xl px-4 py-2.5 w-72 cursor-pointer hover:border-ink-300 transition-colors flex-shrink-0">
            <svg className="w-4 h-4 text-ink-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M16.65 16.65A7.5 7.5 0 1 0 3 10.5a7.5 7.5 0 0 0 13.65 6.15z" />
            </svg>
            <span className="text-sm text-ink-400 flex-1 select-none">Search projects, RFIs...</span>
            <kbd className="bg-white border border-ink-200 rounded px-1.5 py-0.5 text-[11px] text-ink-400 font-mono flex-shrink-0">⌘K</kbd>
          </div>

          {/* Bell */}
          <button className="p-2.5 rounded-lg hover:bg-ink-50 text-ink-400 hover:text-ink-600 transition-colors flex-shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          </button>

          {/* User card */}
          <div className="flex items-center gap-3 bg-ink-100 rounded-xl px-3.5 py-2 flex-shrink-0">
            {isTML ? (
              <div className="h-9 w-auto flex-shrink-0 flex items-center">
                <img src="/tata-logo.svg" alt="Tata" className="h-8 w-auto rounded-md" />
              </div>
            ) : supplierLogoUrl && !logoError ? (
              <img
                src={supplierLogoUrl}
                alt={supplierName ?? ""}
                className="h-9 w-auto max-w-[72px] object-contain rounded flex-shrink-0"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="w-9 h-9 rounded-full bg-ink-900 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold leading-none">{initials}</span>
              </div>
            )}
            <div className="leading-tight">
              <p className="text-sm font-semibold text-ink-900 truncate max-w-[140px]">{displayName}</p>
              <p className="text-[11px] text-ink-400">{orgLabel}</p>
            </div>
            <button onClick={logout} title="Sign out" className="text-ink-400 hover:text-ink-700 transition-colors ml-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="w-52 flex-shrink-0 border-r border-ink-200 bg-white flex flex-col py-4 px-3 gap-1">
          <nav className="flex flex-col gap-0.5">
            {isTML ? (
              <>
                <NavLink to="/projects" className={sideNavClass}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                  </svg>
                  Projects
                </NavLink>
                <NavLink to="/suppliers" className={sideNavClass}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                  Vendor master
                </NavLink>
                <NavLink to="/sessions" className={sideNavClass}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  Sessions
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/sessions" className={sideNavClass}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                  My sessions
                </NavLink>
                <NavLink to="/catalogue" className={sideNavClass}>
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                  </svg>
                  My catalogue
                </NavLink>
              </>
            )}
          </nav>
        </aside>

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
    </div>
  );
}
