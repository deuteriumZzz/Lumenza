"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type ChatResponse, type Mode } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta?: Pick<ChatResponse, "provider" | "model" | "mocked" | "used_fallback" | "credits_charged">;
}

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "fast", label: "Fast", hint: "OpenAI, quickest turnaround" },
  { value: "smart", label: "Smart", hint: "Anthropic, most capable" },
  { value: "cheap", label: "Cheap", hint: "Gemini, lowest cost" },
];

export default function ChatPage() {
  return (
    <RequireAuth>
      <Chat />
    </RequireAuth>
  );
}

function Chat() {
  const { setBalance } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<Mode>("fast");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<{ kind: "insufficient" | "provider" | "generic"; message: string } | null>(
    null
  );
  const listRef = useRef<HTMLDivElement>(null);

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
      const res = await api.chat(trimmed, mode);
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError({ kind: "insufficient", message: "Not enough credits for this request. Top up to continue." });
      } else if (err instanceof ApiError && err.status === 502) {
        setError({ kind: "provider", message: "Every provider for this mode failed. Nothing was charged." });
      } else {
        setError({ kind: "generic", message: err instanceof ApiError ? err.message : "Something went wrong." });
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
      <h1 className="sr-only">Chat</h1>
      <div ref={listRef} className="flex-1 overflow-y-auto py-8">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted">
            <p className="text-sm">Ask for a post, a repurposed caption, or a content plan.</p>
            <p className="mt-1 text-xs">Pick a mode below — cost shows after each reply.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-6">
            {messages.map((message) => (
              <li key={message.id}>
                <MessageBlock message={message} />
              </li>
            ))}
          </ol>
        )}

        {sending && (
          <p className="mt-6 text-sm text-muted" aria-live="polite">
            Thinking…
          </p>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className={`mb-4 rounded-md border px-4 py-3 text-sm ${
            error.kind === "insufficient"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-border bg-surface text-muted"
          }`}
        >
          {error.message}
          {error.kind === "insufficient" && (
            <Link href="/pricing" className="ml-2 font-medium underline">
              Go to billing
            </Link>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="mb-8 flex flex-col gap-3 border-t border-border pt-4">
        <div
          role="group"
          aria-label="Response mode"
          className="flex items-center gap-1 self-start rounded-md border border-border bg-surface p-1"
        >
          {MODES.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              aria-pressed={mode === option.value}
              onClick={() => setMode(option.value)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                mode === option.value ? "bg-primary text-white" : "text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

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
            placeholder="Write a message…"
            aria-label="Message"
            rows={2}
            maxLength={8000}
            className="input flex-1 resize-none"
          />
          <button type="submit" disabled={sending || !prompt.trim()} className="btn-primary h-fit">
            Send
          </button>
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
      <p className="max-w-[85%] whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{message.text}</p>
      {message.meta && (
        <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-muted">
          <span>{message.meta.provider}/{message.meta.model}</span>
          <span>·</span>
          <span>{message.meta.credits_charged} credits</span>
          {message.meta.used_fallback && <span className="status-pill bg-accent">fallback</span>}
          {message.meta.mocked && <span className="status-pill bg-surface-raised text-muted">mock</span>}
        </div>
      )}
    </div>
  );
}
