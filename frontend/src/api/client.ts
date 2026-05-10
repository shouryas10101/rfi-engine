import axios, { AxiosError } from "axios";

const TOKEN_KEY = "rfi-engine-token";
const PROFILE_KEY = "rfi-engine-profile";

export function setUserProfile(profile: { email: string; fullName: string | null }): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getUserProfile(): { email: string; fullName: string | null } | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as { email: string; fullName: string | null }) : null;
  } catch { return null; }
}

export function clearUserProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}

const baseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (resp) => resp,
  (err: AxiosError) => {
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      const path = window.location.pathname;
      if (path !== "/login" && !path.startsWith("/onboard/")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}
