export const TOKEN_STORAGE_KEY = "lumenza_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(extractMessage(body) ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

// DRF validation errors can carry multiple messages per field (e.g. Django's
// validate_password raising "too short" and "too common" at once) and
// multiple invalid fields at once. Flatten every string found across all
// fields rather than surfacing only the first, so callers don't silently
// drop errors the user needs to see.
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  const messages = Object.values(record).flatMap((value) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  );
  return messages.length > 0 ? messages.join(" ") : null;
}

// Generous enough to cover /chat/'s worst case server-side: up to two
// sequential provider attempts (fallback) at a 15s request_timeout_seconds
// each, plus network overhead — see providers/base.py on the backend. A
// tighter default would abort legitimate slow-but-successful chat requests.
const DEFAULT_TIMEOUT_MS = 45_000;

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (auth) {
    const token = getToken();
    if (token) headers.set("Authorization", `Token ${token}`);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    signal: options.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export interface User {
  id: number;
  username: string;
  email: string;
}

export interface AuthResponse extends User {
  token: string;
}

export interface Balance {
  balance: string;
  updated_at: string;
}

export type Mode = "fast" | "smart" | "cheap";

export interface ChatResponse {
  text: string;
  provider: string;
  model: string;
  mocked: boolean;
  used_fallback: boolean;
  credits_charged: string;
  balance: string;
}

export interface HistoryEntry {
  id: number;
  provider: string;
  model: string;
  mode: Mode;
  status: "ok" | "error" | "insufficient_credits" | "blocked";
  credits_charged: string;
  latency_ms: number;
  mocked: boolean;
  used_fallback: boolean;
  created_at: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Payment {
  id: number;
  amount_rub: string;
  credits_amount: string;
  status: "pending" | "succeeded" | "canceled";
  created_at: string;
  confirmation_url: string;
}

export type ImageProvider = "openai" | "flux";

export interface GeneratedImageEntry {
  id: number;
  prompt: string;
  provider: string;
  model: string;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "blocked";
  credits_charged: string;
  mocked: boolean;
  image_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export const api = {
  register: (username: string, email: string, password: string) =>
    request<AuthResponse>(
      "/auth/register/",
      { method: "POST", body: JSON.stringify({ username, email, password }) },
      false
    ),
  login: (username: string, password: string) =>
    request<AuthResponse>(
      "/auth/login/",
      { method: "POST", body: JSON.stringify({ username, password }) },
      false
    ),
  logout: () => request<void>("/auth/logout/", { method: "POST" }),
  me: () => request<User>("/auth/me/"),
  balance: () => request<Balance>("/billing/balance/"),
  sandboxTopup: (amount: string) =>
    request<Balance>("/billing/topup/sandbox/", {
      method: "POST",
      body: JSON.stringify({ amount }),
    }),
  topup: (amountRub: string) =>
    request<Payment>("/billing/topup/", {
      method: "POST",
      body: JSON.stringify({ amount_rub: amountRub }),
    }),
  chat: (prompt: string, mode: Mode) =>
    request<ChatResponse>("/chat/", { method: "POST", body: JSON.stringify({ prompt, mode }) }),
  history: (page = 1) => request<Paginated<HistoryEntry>>(`/history/?page=${page}`),
  createImage: (prompt: string, provider: ImageProvider) =>
    request<GeneratedImageEntry>("/images/", {
      method: "POST",
      body: JSON.stringify({ prompt, provider }),
    }),
  images: (page = 1) => request<Paginated<GeneratedImageEntry>>(`/images/?page=${page}`),
  image: (id: number) => request<GeneratedImageEntry>(`/images/${id}/`),
};
