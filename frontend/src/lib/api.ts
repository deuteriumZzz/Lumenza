// Авторизация — это httpOnly cookie (выставляется бэкендом на login/
// register) — она никогда не читается из JS, так что здесь нет токена для
// хранения/чтения/очистки. Читать нужно только cookie csrftoken (намеренно
// НЕ httpOnly, см. паттерн двойной отправки Django), чтобы отправить её
// обратно в заголовке.
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    super(extractMessage(body) ?? `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

// Единая точка для catch-блоков: ApiError уже несёт сообщение, пригодное для
// показа пользователю (см. extractMessage выше), а любая другая ошибка
// (сеть, таймаут, JS-исключение) — нет, отсюда общий fallback.
export function apiErrorMessage(err: unknown, fallback = "Что-то пошло не так."): string {
  return err instanceof ApiError ? err.message : fallback;
}

// Ошибки валидации DRF могут нести несколько сообщений на одно поле
// (например, validate_password в Django одновременно выбрасывает "слишком
// короткий" и "слишком распространённый") и сразу несколько невалидных
// полей. Собираем в одну строку каждое найденное сообщение по всем полям,
// а не показываем только первое — иначе вызывающий код молча теряет
// ошибки, которые пользователю нужно увидеть.
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (typeof record.detail === "string") return record.detail;
  const messages = Object.values(record).flatMap((value) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
  );
  return messages.length > 0 ? messages.join(" ") : null;
}

// Достаточно щедрый запас, чтобы покрыть худший случай /chat/ на сервере:
// до двух последовательных попыток провайдера (запасной вариант) по 15с
// request_timeout_seconds каждая, плюс сетевые накладные расходы — см.
// providers/base.py на бэкенде. Более жёсткий дефолт обрывал бы законные
// медленные, но успешные запросы чата.
const DEFAULT_TIMEOUT_MS = 45_000;

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const method = (options.method ?? "GET").toUpperCase();
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  }

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
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
  telegram_linked: boolean;
}

export interface PublicConfig {
  telegram_bot_username: string;
}

// Форма данных, которую официальный виджет "Login with Telegram"
// передаёт в data-onauth callback — https://core.telegram.org/widgets/login.
export type TelegramWidgetPayload = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
};

export interface Balance {
  balance: string;
  updated_at: string;
}

export type Task = "hook" | "longform" | "hashtags" | "content_plan" | "repurpose" | "translation";

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
  task: Task;
  status: "ok" | "error" | "insufficient_credits" | "blocked" | "task_locked" | "model_locked";
  credits_charged: string;
  latency_ms: number;
  mocked: boolean;
  used_fallback: boolean;
  created_at: string;
}

export interface HistoryQuery {
  task?: Task;
  provider?: string;
  status?: HistoryEntry["status"];
  created_after?: string;
  created_before?: string;
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

export interface Subscription {
  status: "active" | "non_renewing" | "past_due" | "canceled";
  price_rub: string;
  current_period_end: string;
  canceled_at: string | null;
}

export interface ReferralStats {
  referral_link: string;
  referral_code: string;
  referred_count: number;
  rewarded_count: number;
  reward_credits: string;
}

export interface ModelProgress {
  task: string;
  provider: string;
  model: string;
  unlocked: boolean;
  current_requests: number;
  target_requests: number;
  current_days: number;
  target_days: number;
}

export type ImageTask = "realistic" | "illustration" | "premium";

// "edit" не входит в ImageTask/поле task у createImage — это отдельный
// поток (createImageEdit, multipart с входным фото) — но он всё равно
// должен появляться здесь, чтобы типизация прогресса/разблокировки его
// покрывала.
export type TaskOrImageTask = Task | ImageTask | "edit";

export interface ResourceProgress {
  key: TaskOrImageTask;
  current_requests: number;
  target_requests: number;
  current_days: number;
  target_days: number;
}

export interface Progress {
  tier: "free" | "paid";
  unlocked: TaskOrImageTask[];
  progress: ResourceProgress[];
}

export interface GeneratedImageEntry {
  id: number;
  prompt: string;
  provider: string;
  model: string;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "blocked";
  credits_charged: string;
  mocked: boolean;
  image_url: string | null;
  source_image_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TranscriptionEntry {
  id: number;
  text: string;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "task_locked";
  credits_charged: string;
  mocked: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface SpeechClipEntry {
  id: number;
  text: string;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "task_locked";
  credits_charged: string;
  mocked: boolean;
  audio_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface DocumentExtractionEntry {
  id: number;
  text: string;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "task_locked";
  credits_charged: string;
  mocked: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface PhotoAnalysisEntry {
  id: number;
  text: string;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "task_locked";
  credits_charged: string;
  mocked: boolean;
  created_at: string;
  completed_at: string | null;
}

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const headers = new Headers();
  const csrfToken = getCsrfToken();
  if (csrfToken) headers.set("X-CSRFToken", csrfToken);
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers,
    body: formData,
    credentials: "include",
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data as T;
}

export const api = {
  register: (username: string, email: string, password: string, referralCode?: string) =>
    request<User>("/auth/register/", {
      method: "POST",
      body: JSON.stringify({ username, email, password, referral_code: referralCode }),
    }),
  login: (username: string, password: string) =>
    request<User>("/auth/login/", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request<void>("/auth/logout/", { method: "POST" }),
  me: () => request<User>("/auth/me/"),
  publicConfig: () => request<PublicConfig>("/config/"),
  // Единый эндпоинт для входа/регистрации через Telegram и для привязки
  // Telegram к уже залогиненному веб-аккаунту — see backend
  // accounts.views.telegram_auth. `source: "widget"` — payload из
  // window.Telegram Login Widget; `source: "webapp"` — сырой
  // `Telegram.WebApp.initData` (см. TelegramWebAppProvider).
  telegramAuth: (source: "widget" | "webapp", payload: TelegramWidgetPayload | string) =>
    request<User & { created: boolean }>("/auth/telegram/", {
      method: "POST",
      body: JSON.stringify({ source, payload }),
    }),
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
  subscriptionStatus: () => request<Subscription | null>("/billing/subscription/"),
  subscribe: () => request<Payment>("/billing/subscription/subscribe/", { method: "POST" }),
  unsubscribe: () => request<void>("/billing/subscription/cancel/", { method: "POST" }),
  referralStats: () => request<ReferralStats>("/referrals/"),
  chat: (prompt: string, task: Task, model?: string) =>
    request<ChatResponse>("/chat/", { method: "POST", body: JSON.stringify({ prompt, task, model }) }),
  modelsProgress: (task: Task) => request<ModelProgress[]>(`/progress/models/${task}/`),
  history: (page = 1, filters: HistoryQuery = {}) => {
    const params = new URLSearchParams({ page: String(page) });
    const filterEntries: [keyof HistoryQuery, string | undefined][] = [
      ["task", filters.task],
      ["provider", filters.provider],
      ["status", filters.status],
      ["created_after", filters.created_after],
      ["created_before", filters.created_before],
    ];
    filterEntries.forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return request<Paginated<HistoryEntry>>(`/history/?${params.toString()}`);
  },
  createImage: (prompt: string, task: ImageTask) =>
    request<GeneratedImageEntry>("/images/", {
      method: "POST",
      body: JSON.stringify({ prompt, task }),
    }),
  images: (page = 1) => request<Paginated<GeneratedImageEntry>>(`/images/?page=${page}`),
  image: (id: number) => request<GeneratedImageEntry>(`/images/${id}/`),
  createImageEdit: (prompt: string, imageFile: File) => {
    const formData = new FormData();
    formData.append("prompt", prompt);
    formData.append("image", imageFile, imageFile.name);
    return requestMultipart<GeneratedImageEntry>("/images/edit/", formData);
  },
  progress: () => request<Progress>("/progress/"),
  createTranscription: (audioBlob: Blob, filename: string) => {
    const formData = new FormData();
    formData.append("audio", audioBlob, filename);
    return requestMultipart<TranscriptionEntry>("/transcriptions/", formData);
  },
  transcription: (id: number) => request<TranscriptionEntry>(`/transcriptions/${id}/`),
  createSpeech: (text: string) =>
    request<SpeechClipEntry>("/speech/", { method: "POST", body: JSON.stringify({ text }) }),
  speechClip: (id: number) => request<SpeechClipEntry>(`/speech/${id}/`),
  createDocumentExtraction: (file: File) => {
    const formData = new FormData();
    formData.append("document", file, file.name);
    return requestMultipart<DocumentExtractionEntry>("/documents/", formData);
  },
  documentExtraction: (id: number) => request<DocumentExtractionEntry>(`/documents/${id}/`),
  createPhotoAnalysis: (file: File) => {
    const formData = new FormData();
    formData.append("image", file, file.name);
    return requestMultipart<PhotoAnalysisEntry>("/photos/analyze/", formData);
  },
  photoAnalysis: (id: number) => request<PhotoAnalysisEntry>(`/photos/analyze/${id}/`),
};
