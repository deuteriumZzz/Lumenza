"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { CopyResponseButton } from "@/components/copy-response-button";
import { MarkdownResponse } from "@/components/markdown-response";
import { OptionPicker } from "@/components/option-picker";
import { ModelPicker } from "@/components/model-picker";
import { PresetPicker } from "@/components/preset-picker";
import { WorkspacePicker } from "@/components/workspace-picker";
import { ResponseSkeleton } from "@/components/response-skeleton";
import { LumenzaConvergence } from "@/components/lumenza-brand";
import { useChatRouting } from "@/components/chat-routing";
import { useAuth } from "@/lib/auth-context";
import {
  TASK_DEFINITIONS,
  TASK_GROUPS,
  TASK_LABELS,
} from "@/lib/chat-taxonomy";
import {
  api,
  apiErrorMessage,
  ApiError,
  type ChatThreadMessage,
  type ModelProgress,
  type StreamChatEvent,
  type Task,
  type TranscriptionEntry,
  type Workspace,
} from "@/lib/api";
import { usePolledStatus } from "@/lib/use-polled-status";

const TRANSCRIPTION_IN_PROGRESS = new Set(["pending", "processing"]);

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: Pick<ChatThreadMessage, "provider" | "model" | "task" | "mocked" | "used_fallback" | "credits_charged">;
}

// Человекочитаемые имена — по факту уже используемых в
// providers.services.TASK_ROUTES id моделей (backend/providers/services.py).
// Нераспознанный id (новая модель добавлена в маршрут, лейбл сюда ещё не
// добавлен) просто показывается как есть — не ошибка, а понятный fallback.
const MODEL_LABELS: Record<string, string> = {
  "claude-3-5-sonnet-latest": "Claude 3.5 Sonnet",
  "gpt-4o-mini": "GPT-4o mini",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
};

function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

// Разные интонации, чтобы пустой экран не выглядел одной и той же
// заготовкой при каждом визите — выбор случайный один раз при монтировании
// (не на каждый ре-рендер, см. useState с функцией-инициализатором ниже).
const GREETINGS: { title: string; subtitle: string }[] = [
  { title: "Чем займёмся сегодня?", subtitle: "Спросите, исследуйте или создайте — маршрут подберём сами." },
  { title: "О чём подумаем?", subtitle: "Выберите модель или оставьте автоматический режим." },
  { title: "Готов помочь.", subtitle: "Текст, поиск, анализ или творческая задача — просто опишите цель." },
  { title: "С чего начнём?", subtitle: "Можно писать своими словами, без специальных команд." },
  { title: "Слушаю.", subtitle: "Для сложных задач доступны модели разных провайдеров." },
];

function toLocalMessage(entry: ChatThreadMessage): Message {
  return {
    id: String(entry.id),
    role: entry.role,
    text: entry.text,
    meta:
      entry.role === "assistant"
        ? {
            provider: entry.provider,
            model: entry.model,
            task: entry.task,
            mocked: entry.mocked,
            used_fallback: entry.used_fallback,
            credits_charged: entry.credits_charged,
          }
        : undefined,
  };
}

// threadId === null -> состояние "новый чат" (ещё ничего не отправлено,
// сам тред создаётся лениво при первом сообщении). threadId !== null ->
// уже существующий тред, сообщения подгружаются при монтировании.
export function ChatThreadView({ threadId }: { threadId: number | null }) {
  const router = useRouter();
  const { setBalance } = useAuth();
  const { routing, setRouting } = useChatRouting();
  // Отдельно от routing (auto/task/model/preset) — вложение базы знаний
  // ортогонально выбору модели/пресета, можно совмещать с любым из них.
  const [attachedWorkspace, setAttachedWorkspace] = useState<Workspace | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // null while sending is true -> the pre-stream POST is still in flight
  // (show the dot skeleton, same as before streaming existed); non-null
  // once a generation was accepted -> that message's text grows with each
  // SSE chunk instead, so the skeleton is hidden in favor of the message.
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [loadingThread, setLoadingThread] = useState(threadId !== null);
  const [prompt, setPrompt] = useState("");
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [models, setModels] = useState<ModelProgress[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{
    kind: "insufficient" | "provider" | "locked" | "generic";
    message: string;
  } | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [dictationEntry, setDictationEntry] = useState<TranscriptionEntry | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const transcribing = dictationEntry !== null && TRANSCRIPTION_IN_PROGRESS.has(dictationEntry.status);
  const listRef = useRef<HTMLDivElement>(null);
  // Один случайный вариант на монтирование компонента, не на каждый
  // ре-рендер — иначе текст "мигал" бы при любом обновлении состояния.
  const [greeting] = useState(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)]);
  const [lastModel, setLastModel] = useState<string | null>(null);
  const modelsRequestRef = useRef(0);

  const refreshModelsCatalog = useCallback(async () => {
    const requestId = ++modelsRequestRef.current;
    try {
      const catalog = await api.modelsCatalog();
      if (requestId !== modelsRequestRef.current) return;
      setModels(catalog);
      setModelsError(false);
    } catch {
      if (requestId === modelsRequestRef.current) setModelsError(true);
    }
  }, []);

  useEffect(() => {
    const requestId = ++modelsRequestRef.current;
    api.modelsCatalog().then(
      (catalog) => {
        if (requestId !== modelsRequestRef.current) return;
        setModels(catalog);
        setModelsError(false);
      },
      () => {
        if (requestId === modelsRequestRef.current) setModelsError(true);
      },
    );
    return () => {
      modelsRequestRef.current += 1;
    };
  }, []);

  // Смена треда (переход по сайдбару на другой /chat/[threadId]) должна
  // сбросить список сообщений сразу — иначе на миг видно сообщения
  // предыдущего треда, пока не подгрузятся новые. Синхронный сброс во
  // время рендера, а не setState внутри тела эффекта — эффект ниже только
  // выполняет сам fetch.
  const [prevThreadId, setPrevThreadId] = useState(threadId);
  if (threadId !== prevThreadId) {
    setPrevThreadId(threadId);
    setMessages([]);
    setLoadingThread(threadId !== null);
  }

  useEffect(() => {
    if (threadId === null) return;
    let cancelled = false;
    api
      .thread(threadId)
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages.map(toLocalMessage));
        const lastAssistant = [...data.messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) setLastModel(lastAssistant.model);
        // A generation was still running when the page loaded/reloaded —
        // resume tailing it instead of losing the in-progress response.
        if (data.active_generation_id) {
          const assistantId = crypto.randomUUID();
          setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);
          setSending(true);
          attachStream(data.active_generation_id, assistantId, threadId);
        }
      })
      .catch(() => {
        if (!cancelled) setError({ kind: "generic", message: "Не удалось загрузить чат." });
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  // Ctrl/Cmd+Shift+M — быстрая надиктовка, не отвлекаясь на мышь.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPrompt("");
        setThemePickerOpen(false);
        router.push("/chat");
        requestAnimationFrame(() => textareaRef.current?.focus());
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (dictating) stopDictation();
        else void startDictation();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictating, router]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendPrompt();
  }

  // Opens (or reopens) an SSE connection tailing a generation — used both
  // right after starting a new one and when resuming an in-flight one on
  // thread load. The server always resends the full buffered text as the
  // first event of any connection, so reconnecting (network blip, or the
  // browser's own EventSource auto-retry) is inherently safe here — no
  // offset/dedup bookkeeping needed on this end.
  function attachStream(generationId: string, messageId: string, forThreadId: number) {
    eventSourceRef.current?.close();
    const source = new EventSource(api.chatStreamUrl(forThreadId, generationId), {
      withCredentials: true,
    });
    eventSourceRef.current = source;
    setStreamingMessageId(messageId);

    function finish() {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
      setSending(false);
      setStreamingMessageId(null);
    }

    source.onmessage = (event) => {
      let payload: StreamChatEvent;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload.type === "chunk") {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, text: payload.text } : m))
        );
        return;
      }

      if (payload.type === "done") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  text: payload.text,
                  meta: {
                    provider: payload.provider,
                    model: payload.model,
                    task: payload.task as Task,
                    mocked: payload.mocked,
                    used_fallback: payload.used_fallback,
                    credits_charged: payload.credits_charged,
                  },
                }
              : m
          )
        );
        setBalance({ balance: payload.balance, updated_at: new Date().toISOString() });
        setLastModel(payload.model);
        void refreshModelsCatalog();
        finish();
        return;
      }

      // "error" here only happens after acceptance — moderation/credit
      // rejections are already returned synchronously from
      // streamThreadMessage() below, never as an SSE event.
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setError(
        payload.code === "provider_error" || payload.code === "stalled"
          ? { kind: "provider", message: "Все провайдеры для этой задачи не сработали. Списание не производилось." }
          : { kind: "generic", message: payload.detail ?? "Что-то пошло не так." }
      );
      finish();
    };
  }

  async function sendPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || sending) return;

    setError(null);
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    const routingAtSubmit = routing;
    const taskOverride = routingAtSubmit.kind === "auto" ? undefined : routingAtSubmit.task;
    const modelOverride =
      routingAtSubmit.kind === "model" || routingAtSubmit.kind === "preset"
        ? routingAtSubmit.model
        : undefined;
    const systemOverride = routingAtSubmit.kind === "preset" ? routingAtSubmit.system : undefined;
    const temperatureOverride =
      routingAtSubmit.kind === "preset" ? routingAtSubmit.temperature : undefined;
    setSending(true);

    try {
      let activeThreadId = threadId;
      if (activeThreadId === null) {
        const created = await api.createThread();
        activeThreadId = created.id;
      }

      const { generation_id } = await api.streamThreadMessage(
        activeThreadId,
        trimmed,
        taskOverride,
        modelOverride,
        systemOverride,
        temperatureOverride,
        attachedWorkspace?.id ?? null,
      );
      const assistantId = crypto.randomUUID();
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);

      // Первое сообщение нового чата — переезжаем на постоянный URL треда,
      // чтобы он появился в сайдбаре и пережил обновление страницы.
      if (threadId === null) {
        router.push(`/chat/${activeThreadId}`);
      }
      attachStream(generation_id, assistantId, activeThreadId);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError({ kind: "insufficient", message: "Недостаточно кредитов для этого запроса. Пополните баланс, чтобы продолжить." });
      } else if (err instanceof ApiError && err.status === 403) {
        const code = (err.body as { code?: string } | null)?.code;
        setError({
          kind: "locked",
          message:
            code === "model_requires_pro"
              ? "Эта premium-модель доступна в Pro. Выберите standard-модель или перейдите на Pro."
              : apiErrorMessage(err),
        });
      } else if (err instanceof ApiError && err.status === 502) {
        setError({ kind: "provider", message: "Все провайдеры для этой задачи не сработали. Списание не производилось." });
      } else {
        setError({ kind: "generic", message: apiErrorMessage(err) });
      }
      setSending(false);
    } finally {
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (list && typeof list.scrollTo === "function") {
          list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
        }
      });
    }
  }

  async function startDictation() {
    setMicError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        void submitDictation(blob);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setDictating(true);
    } catch {
      setMicError("Не удалось получить доступ к микрофону — проверьте разрешения браузера.");
    }
  }

  function stopDictation() {
    mediaRecorderRef.current?.stop();
    setDictating(false);
  }

  async function submitDictation(blob: Blob) {
    setMicError(null);
    try {
      const entry = await api.createTranscription(blob, "dictation.webm");
      setDictationEntry(entry);
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setMicError("Недостаточно кредитов для распознавания голоса.");
      } else {
        setMicError(apiErrorMessage(err));
      }
    }
  }

  // Транскрибация — асинхронная задача (тот же Celery-конвейер, что и
  // "Голос в текст" в Студии), а не мгновенный ответ — опрашиваем статус
  // тем же общим хуком, что и там (usePolledStatus), пока не выйдет из
  // pending/processing.
  usePolledStatus(
    dictationEntry,
    TRANSCRIPTION_IN_PROGRESS,
    api.transcription,
    (updated) => {
      setDictationEntry(updated);
      if (updated.status === "ok" && updated.text) {
        setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${updated.text}` : updated.text));
      } else if (updated.status === "error") {
        setMicError("Не удалось распознать голос — попробуйте ещё раз.");
      }
    },
    () => setMicError("Потеряна связь при распознавании голоса — попробуйте ещё раз.")
  );

  const slashQuery = prompt.startsWith("/") ? prompt.slice(1).trim().toLocaleLowerCase() : null;
  const slashOptions = slashQuery === null
    ? []
    : TASK_DEFINITIONS.filter((option) =>
        `${option.label} ${option.hint}`.toLocaleLowerCase().includes(slashQuery),
      );

  function chooseTask(task: Task) {
    setRouting({ kind: "task", task });
    setPrompt("");
    setThemePickerOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 sm:px-6">
      <h1 className="sr-only">Чат</h1>
      <div ref={listRef} className="flex-1 overflow-y-auto py-8">
        {loadingThread ? (
          <ResponseSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center pb-8 text-center">
            <motion.div layoutId="lumenza-workspace-core" transition={springs.gentle}>
              <LumenzaConvergence />
            </motion.div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">{greeting.title}</h2>
            <p className="mt-3 max-w-lg text-pretty text-sm leading-6 text-muted">{greeting.subtitle}</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-6" aria-live="polite">
            {messages.map((message) => (
              <motion.li
                key={message.id}
                initial={{ opacity: 0, y: motionTokens.distance.sm }}
                animate={{ opacity: 1, y: 0 }}
                transition={springs.gentle}
              >
                <MessageBlock message={message} />
              </motion.li>
            ))}
          </ol>
        )}

        {sending && streamingMessageId === null && <ResponseSkeleton />}
      </div>

      {error && (
        <div
          role="alert"
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            error.kind === "insufficient" || error.kind === "locked"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border bg-surface text-muted"
          }`}
        >
          {error.message}
          {error.kind === "insufficient" && (
            <Link href="/pricing" className="ml-2 font-medium underline">
              К оплате
            </Link>
          )}
          {error.kind === "locked" && (
            <Link href="/pricing" className="ml-2 font-medium underline">
              Улучшить тариф
            </Link>
          )}
        </div>
      )}

      {micError && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {micError}
        </p>
      )}

      <motion.form
        layoutId="lumenza-workspace-composer"
        transition={springs.gentle}
        aria-label="Написать сообщение"
        data-focus-surface="composer"
        onSubmit={onSubmit}
        className="chat-composer relative mb-3"
      >
        {slashQuery !== null && (
          <div role="dialog" aria-label="Команды" className="slash-command-menu">
            <div className="border-b border-border/70 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Инструменты Lumenza</p>
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {slashOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={routing.kind !== "auto" && routing.task === option.value}
                  onClick={() => chooseTask(option.value)}
                  className="slash-command-option"
                >
                  <span className="slash-command-icon" aria-hidden="true">/</span>
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="block truncate text-xs text-muted">{option.hint}</span>
                  </span>
                </button>
              ))}
              {slashOptions.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-muted">Команда не найдена</p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-start">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 200)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && slashQuery !== null) {
                event.preventDefault();
                setPrompt("");
                return;
              }
              if (event.key === "Enter" && !event.shiftKey && slashQuery !== null && slashOptions.length > 0) {
                event.preventDefault();
                chooseTask(slashOptions[0].value);
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendPrompt();
              }
            }}
            placeholder="Спросите что угодно. «/» — инструменты"
            aria-label="Сообщение"
            rows={1}
            maxLength={8000}
            className="chat-composer-editor"
          />
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <ModelPicker
            models={models}
            selectedModel={routing.kind === "model" ? routing.model : null}
            selectedTask={routing.kind === "model" ? routing.task : null}
            onSelect={(model, task) => {
              if (!model || !task) {
                setRouting({ kind: "auto" });
                return;
              }
              setRouting({ kind: "model", model, task: task as Task });
            }}
          />
          <PresetPicker
            activePresetId={routing.kind === "preset" ? routing.presetId : null}
            onSelect={(preset) => {
              if (!preset) {
                setRouting({ kind: "auto" });
                return;
              }
              setRouting({
                kind: "preset",
                presetId: preset.id,
                presetName: preset.name,
                task: preset.task,
                model: preset.model,
                system: preset.system_prompt || undefined,
                temperature: preset.temperature ?? undefined,
              });
            }}
          />
          <WorkspacePicker
            selectedWorkspaceId={attachedWorkspace?.id ?? null}
            onSelect={setAttachedWorkspace}
          />
          <button
            type="button"
            onClick={() => setThemePickerOpen((open) => !open)}
            aria-expanded={themePickerOpen}
            className={`composer-tool-button ${routing.kind === "task" ? "is-active" : ""}`}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 5h12M6.5 10h7M8.5 15h3" strokeLinecap="round" />
            </svg>
            <span
              className="hidden sm:inline"
              data-active-tool={routing.kind === "task" ? "" : undefined}
            >
              {routing.kind === "task" ? TASK_LABELS[routing.task] : "Режим"}
            </span>
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden max-w-44 truncate text-xs text-muted lg:block">
              {modelsError
                ? "Каталог недоступен"
                : lastModel
                  ? `Ответил: ${modelLabel(lastModel)}`
                  : "Умная маршрутизация"}
            </span>
          <button
            type="button"
            onClick={() => (dictating ? stopDictation() : void startDictation())}
            disabled={transcribing}
            aria-pressed={dictating}
            aria-label={dictating ? "Остановить надиктовку (Ctrl/Cmd+Shift+M)" : "Надиктовать сообщение (Ctrl/Cmd+Shift+M)"}
            title={dictating ? "Остановить надиктовку (Ctrl/Cmd+Shift+M)" : "Надиктовать сообщение (Ctrl/Cmd+Shift+M)"}
            className={`composer-icon-button ${
              dictating
                ? "bg-danger/10 text-danger"
                : "text-muted hover:bg-surface-raised hover:text-ink"
            }`}
          >
            {transcribing ? (
              <span className="size-3 animate-pulse rounded-full bg-current" aria-hidden="true" />
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
                <path d="M12 18v3" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <motion.button
            type="submit"
            disabled={sending || !prompt.trim()}
            whileTap={{ scale: motionTokens.scale.press }}
            transition={springs.snappy}
            aria-label="Отправить"
            title="Отправить"
            className="composer-send-button"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 15V5m0 0L6 9m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
          </div>
        </div>

        {themePickerOpen && (
          <div className="task-picker-popover">
            {TASK_GROUPS.map((group) => (
              <section key={group.key} aria-label={group.label}>
                <p className="px-2 pb-2 text-xs font-medium text-ink">{group.label}</p>
                <OptionPicker
                  ariaLabel={group.label}
                  options={TASK_DEFINITIONS.filter((option) => option.group === group.key)}
                  selected={routing.kind === "auto" ? "" : routing.task}
                  onSelect={(value) => chooseTask(value as Task)}
                  className="flex flex-col items-stretch gap-1"
                />
              </section>
            ))}
          </div>
        )}
      </motion.form>

      <div className="mb-5 flex flex-wrap items-center justify-center gap-1.5" aria-label="Быстрые действия">
        <button
          type="button"
          onClick={() => chooseTask("search")}
          className={`quick-action-chip ${routing.kind !== "auto" && routing.task === "search" ? "is-active" : ""}`}
        >
          <span aria-hidden="true">⌕</span>
          <span data-active-tool={routing.kind !== "auto" && routing.task === "search" ? "" : undefined}>
            Исследовать
          </span>
        </button>
        <button type="button" onClick={() => router.push("/studio")} className="quick-action-chip">
          <span aria-hidden="true">◇</span> Изображение
        </button>
        <button type="button" onClick={() => router.push("/studio?mode=documents")} className="quick-action-chip">
          <span aria-hidden="true">▤</span> Документ
        </button>
        <button type="button" onClick={() => router.push("/studio?mode=analyze")} className="quick-action-chip">
          <span aria-hidden="true">◎</span> Анализ
        </button>
        <span className="hidden text-[11px] text-muted sm:inline">Введите / для всех режимов</span>
      </div>
    </div>
  );
}

function MessageBlock({ message }: { message: Message }) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end">
        <p className="max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{message.text}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <MarkdownResponse content={message.text} />
      <div className="flex flex-wrap items-center gap-2">
        <CopyResponseButton text={message.text} />
        {message.meta && (
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted">
            <span className="text-ink">{modelLabel(message.meta.model)}</span>
            {message.meta.task && (
              <>
                <span>·</span>
                <span>{TASK_LABELS[message.meta.task] ?? message.meta.task}</span>
              </>
            )}
            <span>·</span>
            <span>{message.meta.credits_charged} кредитов</span>
            {message.meta.used_fallback && <span className="status-pill bg-accent">резерв</span>}
            {message.meta.mocked && <span className="status-pill bg-surface-raised text-muted">мок</span>}
          </div>
        )}
      </div>
    </div>
  );
}
