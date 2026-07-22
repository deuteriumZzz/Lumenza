"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { CopyResponseButton } from "@/components/copy-response-button";
import { MarkdownResponse } from "@/components/markdown-response";
import { LockedOptionPicker } from "@/components/locked-option-picker";
import { ModelPicker } from "@/components/model-picker";
import { RequireAuth } from "@/components/require-auth";
import { ResponseSkeleton } from "@/components/response-skeleton";
import { UnlockToasts } from "@/components/unlock-toast";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type ChatResponse, type ModelProgress, type Task } from "@/lib/api";
import { useUnlockProgress } from "@/lib/use-unlock-progress";
import { Images } from "@/app/images/page";
import { Voice } from "@/app/voice/page";
import { Documents } from "@/app/documents/page";
import { Analyze } from "@/app/analyze/page";

type Mode = "chat" | "images" | "voice" | "documents" | "analyze";

const MODES: { key: Mode; icon: string; label: string }[] = [
  { key: "chat", icon: "✍️", label: "Текст" },
  { key: "images", icon: "🎨", label: "Картинки" },
  { key: "voice", icon: "🎙️", label: "Голос" },
  { key: "documents", icon: "📄", label: "Документы" },
  { key: "analyze", icon: "🖼️", label: "Анализ фото" },
];

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: Pick<ChatResponse, "provider" | "model" | "mocked" | "used_fallback" | "credits_charged">;
}

const TASKS: { value: Task; label: string; hint: string }[] = [
  { value: "hook", label: "Хук", hint: "Короткая цепляющая первая строка" },
  { value: "longform", label: "Лонгформ", hint: "Полная статья или подробный пост" },
  { value: "hashtags", label: "Хэштеги", hint: "Теги для охвата и обнаружения" },
  { value: "content_plan", label: "Контент-план", hint: "Идеи и расписание на неделю вперёд" },
  { value: "repurpose", label: "Репёрпоз", hint: "Адаптировать пост под другую платформу" },
  { value: "translation", label: "Перевод", hint: "Перевести или локализовать подпись" },
];

const TASK_LABELS: Record<string, string> = Object.fromEntries(
  TASKS.map((option) => [option.value, option.label])
);

export default function ChatPage() {
  return (
    <RequireAuth>
      <Studio />
    </RequireAuth>
  );
}

// Единая "студия": один экран вместо пяти отдельных страниц
// (chat/images/voice/documents/analyze) — категории переключаются
// pill-кнопками, ничего никуда не уходит. Каждый режим переиспользует
// ровно тот же компонент/эндпоинты, что раньше жили на своей странице —
// это перестройка навигации, а не новый функционал.
function Studio() {
  const [mode, setMode] = useState<Mode>("chat");

  return (
    <div className="flex flex-1 flex-col">
      <nav
        aria-label="Режим студии"
        className="mx-auto mt-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 px-6"
      >
        {MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={mode === option.key}
            onClick={() => setMode(option.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150 ${
              mode === option.key
                ? "border-primary bg-primary/10 text-ink"
                : "border-border bg-surface text-muted hover:text-ink"
            }`}
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </nav>

      {mode === "chat" && <Chat />}
      {mode === "images" && <Images />}
      {mode === "voice" && <Voice />}
      {mode === "documents" && <Documents />}
      {mode === "analyze" && <Analyze />}
    </div>
  );
}

function Chat() {
  const { setBalance } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [task, setTask] = useState<Task>("repurpose");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{
    kind: "insufficient" | "provider" | "locked" | "generic";
    message: string;
  } | null>(null);
  const { refreshProgress, isUnlocked, progressFor, justUnlocked, dismissUnlock } = useUnlockProgress();
  const listRef = useRef<HTMLDivElement>(null);

  // Пикер по модели, на ступень ниже выбора задачи. null у selectedModel
  // значит "пусть бэкенд использует основной вариант задачи по умолчанию" —
  // то же поведение, что и до появления этой функции, так что пользователь,
  // который никогда не трогает пикер, вообще не видит изменений.
  const [models, setModels] = useState<ModelProgress[] | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // Сбрасывает пикер по модели при смене задачи, следуя паттерну React
  // "корректировка состояния во время рендера" вместо эффекта (эффект,
  // синхронно вызывающий setState на каждом рендере этой зависимости,
  // вызывает лишний, избегаемый рендер) — см.
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const [prevTask, setPrevTask] = useState(task);
  if (task !== prevTask) {
    setPrevTask(task);
    setSelectedModel(null);
  }

  useEffect(() => {
    api.modelsProgress(task).then(setModels).catch(() => setModels(null));
  }, [task]);

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
    setSending(true);

    try {
      const res = await api.chat(trimmed, task, selectedModel ?? undefined);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: res.text,
          meta: {
            provider: res.provider,
            model: res.model,
            mocked: res.mocked,
            used_fallback: res.used_fallback,
            credits_charged: res.credits_charged,
          },
        },
      ]);
      setBalance({ balance: res.balance, updated_at: new Date().toISOString() });
      void refreshProgress();
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
              : "Эта задача ещё не разблокирована на вашем тарифе.",
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6">
      <h1 className="sr-only">Чат</h1>
      <UnlockToasts
        unlockedKeys={justUnlocked}
        labelFor={(key) => TASK_LABELS[key] ?? key}
        onDismiss={dismissUnlock}
      />
      <div ref={listRef} className="flex-1 overflow-y-auto py-8">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Чем займёмся сегодня?</h2>
            <p className="mt-2 text-sm text-muted">Запросите пост, репёрпоз подписи или контент-план.</p>
            <p className="mt-1 text-xs text-muted">Выберите задачу ниже — стоимость покажется после ответа.</p>
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

      <form onSubmit={onSubmit} className="mb-8 flex flex-col gap-3 border-t border-border pt-4">
        <LockedOptionPicker
          ariaLabel="Задача"
          options={TASKS}
          selected={task}
          onSelect={(value) => setTask(value as Task)}
          isUnlocked={isUnlocked}
          progressFor={progressFor}
        />

        {models && models.length > 1 && (
          <ModelPicker
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
          />
        )}

        <div className="flex items-end gap-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendPrompt();
              }
            }}
            placeholder="Запросите подпись, пост или идею для контента…"
            aria-label="Сообщение"
            rows={2}
            maxLength={8000}
            className="input flex-1 resize-none"
          />
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
