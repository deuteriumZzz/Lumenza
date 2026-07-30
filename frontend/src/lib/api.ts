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
  tier: "free" | "paid";
}

export interface PublicConfig {
  telegram_bot_username: string;
  telegram_bot_id: string;
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

// Свободный текстовый профиль, подмешиваемый в промпт агента (см.
// backend agents.services.render_step_prompt) — общий блок плюс блок по
// домену, совпадающему с категорией агента. Домен добавляется сюда только
// когда у него уже есть хотя бы один рабочий агент (см. AgentCategory
// ниже) — то же правило, что у вкладок каталога.
export interface UserContextData {
  general?: { tone?: string; banned_topics?: string };
  content?: { niche?: string; audience?: string; products?: string; examples?: string };
  research?: { topics?: string; depth?: string };
  documents?: { typical_formats?: string };
}

export interface UserContextEntry {
  data: UserContextData;
}

export type Task =
  | "hook"
  | "longform"
  | "hashtags"
  | "content_plan"
  | "repurpose"
  | "translation"
  | "search";

export interface ChatResponse {
  text: string;
  provider: string;
  model: string;
  task: Task;
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

export interface ChatThread {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatThreadMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  provider: string;
  model: string;
  task: Task | "";
  mocked: boolean;
  used_fallback: boolean;
  credits_charged: string;
  created_at: string;
}

export interface Preset {
  id: number;
  name: string;
  model: string;
  task: Task;
  system_prompt: string;
  temperature: number | null;
  created_at: string;
  updated_at: string;
}

export interface PresetInput {
  name: string;
  model: string;
  task: Task;
  system_prompt?: string;
  temperature?: number | null;
}

export interface Workspace {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSource {
  id: number;
  kind: "text" | "image";
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits";
  raw_text: string;
  credits_charged: string;
  error_message: string;
  mocked: boolean;
  created_at: string;
  completed_at: string | null;
}

export interface ChunkMatch {
  id: number;
  text: string;
  score: number;
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

export interface UsageTotals {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  credits_charged: string;
  requests: number;
}

export interface UsageByModel extends UsageTotals {
  provider: string;
  model: string;
}

export interface UsageSummary {
  total: UsageTotals;
  by_model: UsageByModel[];
}

export interface ModelProgress {
  task: string;
  provider: string;
  model: string;
  unlocked: boolean;
  access_class: "standard" | "premium";
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

export type AgentCategory = "content" | "research" | "documents";

export interface AgentField {
  key: string;
  label: string;
  type: "text" | "select" | "document_upload";
  required: boolean;
  max_length?: number;
  options?: string[];
}

export interface AgentSummary {
  slug: string;
  name: string;
  description: string;
  category: AgentCategory;
}

export interface AgentDetail extends AgentSummary {
  version: number;
  input_schema: { fields: AgentField[] };
}

export interface AgentRunStep {
  key: string;
  label: string;
  status: "pending" | "running" | "ok" | "error";
  provider?: string;
  model?: string;
  error_message?: string;
}

export interface ThreadsContentPlan {
  branches: { title: string; angle: string }[];
  hooks: { branch: string; variants: string[] }[];
  schedule: { time: string; branch: string; post_text: string }[];
  variants: string[];
}

export interface ResearchDigestResult {
  topic: string;
  summary: string;
  key_points: string[];
  sources_note: string;
}

export interface DocumentSummaryResult {
  summary: string;
  key_points: string[];
  answer: string;
}

export interface AgentRun {
  id: number;
  agent: string;
  agent_version: number;
  status: "pending" | "processing" | "ok" | "error" | "insufficient_credits" | "blocked";
  steps: AgentRunStep[];
  result: ThreadsContentPlan | ResearchDigestResult | DocumentSummaryResult | null;
  credits_charged: string;
  error_message: string;
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
  userContext: () => request<UserContextEntry>("/auth/context/"),
  updateUserContext: (data: UserContextData) =>
    request<UserContextEntry>("/auth/context/", {
      method: "PUT",
      body: JSON.stringify({ data }),
    }),
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
  usageSummary: () =>
    request<UsageSummary>("/providers/usage-summary/"),
  chat: (prompt: string, task: Task, model?: string) =>
    request<ChatResponse>("/chat/", { method: "POST", body: JSON.stringify({ prompt, task, model }) }),
  threads: (page = 1) => request<Paginated<ChatThread>>(`/threads/?page=${page}`),
  createThread: () => request<ChatThread>("/threads/", { method: "POST", body: "{}" }),
  thread: (id: number) => request<ChatThread & { messages: ChatThreadMessage[] }>(`/threads/${id}/`),
  deleteThread: (id: number) => request<void>(`/threads/${id}/`, { method: "DELETE" }),
  // task не передан -> бэкенд сам определяет тему по смыслу промпта
  // (providers.services.run_chat -> classify_task) — веб-чат больше не
  // заставляет выбирать тему вручную по умолчанию. system/temperature
  // приходят от выбранного пресета (см. PresetPicker) — пусто/не
  // передано ведёт себя ровно как раньше. workspaceId — вложенная база
  // знаний (см. WorkspacePicker), тоже необязательная.
  sendThreadMessage: (
    threadId: number,
    prompt: string,
    task?: Task,
    model?: string,
    system?: string,
    temperature?: number,
    workspaceId?: number | null,
  ) =>
    request<ChatResponse>(`/threads/${threadId}/messages/`, {
      method: "POST",
      body: JSON.stringify({ prompt, task, model, system, temperature, workspace_id: workspaceId }),
    }),
  modelsProgress: (task: Task) => request<ModelProgress[]>(`/progress/models/${task}/`),
  modelsCatalog: () => request<ModelProgress[]>("/progress/models/"),
  presets: () => request<Preset[]>("/presets/"),
  createPreset: (data: PresetInput) =>
    request<Preset>("/presets/", { method: "POST", body: JSON.stringify(data) }),
  updatePreset: (id: number, data: Partial<PresetInput>) =>
    request<Preset>(`/presets/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePreset: (id: number) => request<void>(`/presets/${id}/`, { method: "DELETE" }),
  workspaces: () => request<Workspace[]>("/knowledge/workspaces/"),
  createWorkspace: (name: string) =>
    request<Workspace>("/knowledge/workspaces/", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteWorkspace: (id: number) =>
    request<void>(`/knowledge/workspaces/${id}/`, { method: "DELETE" }),
  workspaceSources: (workspaceId: number) =>
    request<KnowledgeSource[]>(`/knowledge/workspaces/${workspaceId}/sources/`),
  addTextSource: (workspaceId: number, text: string) =>
    request<KnowledgeSource>(`/knowledge/workspaces/${workspaceId}/sources/text/`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  addImageSource: (workspaceId: number, file: File) => {
    const formData = new FormData();
    formData.append("image", file);
    return requestMultipart<KnowledgeSource>(
      `/knowledge/workspaces/${workspaceId}/sources/image/`,
      formData,
    );
  },
  sourceStatus: (id: number) =>
    request<KnowledgeSource>(`/knowledge/sources/${id}/`),
  searchWorkspace: (workspaceId: number, query: string) =>
    request<ChunkMatch[]>(`/knowledge/workspaces/${workspaceId}/search/`, {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
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
  agents: () => request<AgentSummary[]>("/agents/"),
  agent: (slug: string) => request<AgentDetail>(`/agents/${slug}/`),
  createAgentRun: (
    slug: string,
    input: Record<string, string>,
    idempotencyKey: string,
    workspaceId?: number | null,
  ) =>
    request<AgentRun>(`/agents/${slug}/runs/`, {
      method: "POST",
      body: JSON.stringify({ input, idempotency_key: idempotencyKey, workspace_id: workspaceId }),
    }),
  agentRun: (id: number) => request<AgentRun>(`/agents/runs/${id}/`),
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
