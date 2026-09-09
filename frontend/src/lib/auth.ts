const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const TOKEN_KEY = "reachinbox_token";

export type Me = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null; // guard for server render
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "/login";
}

export function googleLoginUrl() {
  return `${API_BASE}/auth/google`;
}

export async function fetchMe(): Promise<Me | null> {
  const token = getToken();
  if (!token) return null;

  const res = await fetch(`${API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

export function slackConnectUrl(): string {
  const token = getToken();
  return `${API_BASE}/auth/slack?token=${token}`;
}

export async function fetchSlackStatus(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const res = await fetch(`${API_BASE}/auth/slack/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return false;
  const data = await res.json();
  return !!data.connected;
}
