import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, clearToken, clearUserProfile, decodeJwt, getToken, getUserProfile, setToken, setUserProfile } from "../api/client";

type User = {
  userId: string;
  email: string;
  fullName: string | null;
  role: "TML_ADMIN" | "TML_ENGINEER" | "SUPPLIER_ENGINEER";
  supplierId: string | null;
  tenantId: string;
};

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refresh: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadFromToken(): User | null {
  const token = getToken();
  if (!token) return null;
  const payload = decodeJwt<{
    userId: string;
    role: User["role"];
    supplierId: string | null;
    tenantId: string;
  }>(token);
  if (!payload) return null;
  const profile = getUserProfile();
  return {
    userId: payload.userId,
    email: profile?.email ?? "",
    fullName: profile?.fullName ?? null,
    role: payload.role,
    supplierId: payload.supplierId,
    tenantId: payload.tenantId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(loadFromToken());
    setLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setUser(loadFromToken());
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      async login(email, password) {
        const resp = await api.post("/auth/login", { email, password });
        setToken(resp.data.token);
        setUserProfile({ email: resp.data.user.email, fullName: resp.data.user.fullName });
        const payload = decodeJwt<{
          userId: string;
          role: User["role"];
          supplierId: string | null;
          tenantId: string;
        }>(resp.data.token)!;
        setUser({
          userId: payload.userId,
          email: resp.data.user.email,
          fullName: resp.data.user.fullName,
          role: payload.role,
          supplierId: payload.supplierId,
          tenantId: payload.tenantId,
        });
      },
      logout() {
        clearToken();
        clearUserProfile();
        setUser(null);
        window.location.href = "/login";
      },
      refresh,
    }),
    [user, loading, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
