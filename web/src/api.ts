export type Role = "admin" | "dispatcher" | "supervisor" | "driver" | "field";

export type Membership = {
  channelId: string;
  name: string;
  code: string;
  kind: string;
  color: string;
  canTalk: boolean;
  canListen: boolean;
  isPrimary: boolean;
};

export type User = {
  id: string;
  username: string;
  displayName: string;
  callSign: string;
  role: Role;
  unitId: string | null;
  phone: string;
  isActive: boolean;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  locationAt: string | null;
  status: string;
  lastSeenAt: string | null;
  unit?: { id: string; name: string; code: string; color: string } | null;
  memberships?: Membership[];
};

export type Channel = {
  id: string;
  name: string;
  code: string;
  kind: string;
  description: string;
  color: string;
  isActive: boolean;
  maxTalkSec: number;
  members?: {
    id: string;
    userId: string;
    canTalk: boolean;
    canListen: boolean;
    isPrimary: boolean;
    user?: { id: string; displayName: string; callSign: string; role: string };
  }[];
};

export type Unit = { id: string; name: string; code: string; color: string };

const TOKEN_KEY = "kesher_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "שגיאת שרת");
  return data as T;
}
