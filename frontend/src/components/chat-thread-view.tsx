"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { CopyResponseButton } from "@/components/copy-response-button";
import { MarkdownResponse } from "@/components/markdown-response";
import { LockedOptionPicker } from "@/components/locked-option-picker";
import { ResponseSkeleton } from "@/components/response-skeleton";
import { UnlockToasts } from "@/components/unlock-toast";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  apiErrorMessage,
  ApiError,
  type ChatThreadMessage,
  type Task,
  type TranscriptionEntry,
} from "@/lib/api";
import { useUnlockProgress } from "@/lib/use-unlock-progress";
import { usePolledStatus } from "@/lib/use-polled-status";

const TRANSCRIPTION_IN_PROGRESS = new Set(["pending", "processing"]);

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: Pick<ChatThreadMessage, "provider" | "model" | "task" | "mocked" | "used_fallback" | "credits_charged">;
}

const TASKS: { value: Task; label: string; hint: string }[] = [
  { value: "hook", label: "Хук", hint: "Короткая цепляющая первая строка" },
  { value: "longform", label: "Лонгформ", hint: "Полная статья или подробный пост" },
  { value: "hashtags", label: "Хэштеги", hint: "Теги для охвата и обнаружения" },
  { value: "content_plan", label: "Контент-план", hint: "Идеи и расписание на неделю вперёд" },
  { value: "repurpose", label: "Репёрпоз", hint: "Адаптировать пост под другую платформу" },
  { value: "translation", label: "Перевод", hint: "Перевести или локализовать подпись" },
  { value: "search", label: "Поиск", hint: "Ответ с опорой на свежие результаты веб-поиска" },
];

const TASK_LABELS: Record<string, string> = Object.fromEntries(
  TASKS.map((option) => [option.value, option.label])
);

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(threadId !== null);
  const [prompt, setPrompt] = useState("");
  // Тема больше не выбирается вручную по умолчанию — bэкенд сам определяет
  // её по смыслу промпта (providers.services.classify_task). forcedTask —
  // одноразовый override на следующее отправляемое сообщение (кнопки
  // "Выберите тему"/"Искать в интернете" ниже), не липкий на весь разговор.
  const [forcedTask, setForcedTask] = useState<Task | null>(null);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
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
  const { refreshProgress, isUnlocked, progressFor, justUnlocked, dismissUnlock } = useUnlockProgress();
  const listRef = useRef<HTMLDivElement>(null);

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
      })
      .catch(() => {
        if (!cancelled) setError({ kind: "generic", message: "Не удалось загрузить чат." });
      })
      .finally(() => {
        if (!cancelled) setLoadingThread(false);
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Ctrl/Cmd+Shift+M — быстрая надиктовка, не отвлекаясь на мышь.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "m") {
        event.preventDefault();
        if (dictating) stopDictation();
        else void startDictation();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dictating]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void sendPrompt();
  }

  async function sendPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || sending) return;

    setError(null);
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", text: trimmed };
    setMessages((prev) => [...prev, userMessage]);
    setPrompt("");
    const taskOverride = forcedTask ?? undefined;
    setForcedTask(null);
    setSending(true);

    try {
      let activeThreadId = threadId;
      if (activeThreadId === null) {
        const created = await api.createThread();
        activeThreadId = created.id;
      }

      const res = await api.sendThreadMessage(activeThreadId, trimmed, taskOverride);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: res.text,
          meta: {
            provider: res.provider,
            model: res.model,
            task: res.task,
            mocked: res.mocked,
            used_fallback: res.used_fallback,
            credits_charged: res.credits_charged,
          },
        },
      ]);
      setBalance({ balance: res.balance, updated_at: new Date().toISOString() });
      void refreshProgress();

      // Первое сообщение нового чата — переезжаем на постоянный URL треда,
      // чтобы он появился в сайдбаре и пережил обновление страницы.
      if (threadId === null) {
        router.push(`/chat/${activeThreadId}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError({ kind: "insufficient", message: "Недостаточно кредитов для этого запроса. Пополните баланс, чтобы продолжить." });
      } else if (err instanceof ApiError && err.status === 403) {
        const code = (err.body as { code?: string } | null)?.code;
        setError({
          kind: "locked",
          message:
            code === "model_locked"
              ? "Эта модель ещё не разблокирована на вашем тарифе — выберите другую или продолжайте прокачку."
              : "Эта тема ещё не разблокирована на вашем тарифе.",
        });
      } else if (err instanceof ApiError && err.status === 502) {
        setError({ kind: "provider", message: "Все провайдеры для этой задачи не сработали. Списание не производилось." });
      } else {
        setError({ kind: "generic", message: apiErrorMessage(err) });
      }
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
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

  const showQuickActions = !loadingThread && messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6">
      <h1 className="sr-only">Чат</h1>
      <UnlockToasts
        unlockedKeys={justUnlocked}
        labelFor={(key) => TASK_LABELS[key] ?? key}
        onDismiss={dismissUnlock}
      />
      <div ref={listRef} className="flex-1 overflow-y-auto py-8">
        {loadingThread ? (
          <ResponseSkeleton />
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Чем займёмся сегодня?</h2>
            <p className="mt-2 text-sm text-muted">Просто опишите, что нужно — тему подберём сами.</p>
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

        {sending && <ResponseSkeleton />}
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

      {showQuickActions && (
        <div className="relative mb-4 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setThemePickerOpen((open) => !open)}
            aria-expanded={themePickerOpen}
            className="btn-secondary text-sm"
          >
            🎯 Выберите тему{forcedTask ? `: ${TASK_LABELS[forcedTask]}` : ""}
          </button>
          <button
            type="button"
            onClick={() => {
              setForcedTask("search");
              textareaRef.current?.focus();
            }}
            className="btn-secondary text-sm"
          >
            🔎 Искать в интернете
          </button>
          <button type="button" onClick={() => router.push("/studio")} className="btn-secondary text-sm">
            🎨 Создать изображение
          </button>

          {themePickerOpen && (
            <div className="absolute top-full z-10 mt-2 rounded-md border border-border bg-surface p-2 shadow-lg">
              <LockedOptionPicker
                ariaLabel="Тема"
                options={TASKS}
                selected={forcedTask ?? ""}
                onSelect={(value) => {
                  setForcedTask(value as Task);
                  setThemePickerOpen(false);
                  textareaRef.current?.focus();
                }}
                isUnlocked={isUnlocked}
                progressFor={progressFor}
              />
            </div>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mb-8 flex flex-col gap-3 border-t border-border pt-4">
        <div className="flex items-end gap-3">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendPrompt();
              }
            }}
            placeholder="Напишите, что нужно…"
            aria-label="Сообщение"
            rows={2}
            maxLength={8000}
            className="input flex-1 resize-none"
          />
          <button
            type="button"
            onClick={() => (dictating ? stopDictation() : void startDictation())}
            disabled={transcribing}
            aria-pressed={dictating}
            aria-label={dictating ? "Остановить надиктовку (Ctrl/Cmd+Shift+M)" : "Надиктовать сообщение (Ctrl/Cmd+Shift+M)"}
            title={dictating ? "Остановить надиктовку (Ctrl/Cmd+Shift+M)" : "Надиктовать сообщение (Ctrl/Cmd+Shift+M)"}
            className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
              dictating
                ? "border-danger bg-danger/10 text-danger"
                : "border-border bg-surface text-muted hover:text-ink"
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
            className="btn-primary h-fit"
          >
            Отправить
          </motion.button>
        </div>
      </form>
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
            <span>{message.meta.provider}/{message.meta.model}</span>
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
