"use client";

import Link from "next/link";
import { createContext, useContext, useState } from "react";
import type { Task } from "@/lib/api";
import { TASK_LABELS } from "@/lib/chat-taxonomy";

export type ChatRoutingSelection =
  | { kind: "auto" }
  | { kind: "task"; task: Task }
  | { kind: "model"; task: Task; model: string }
  | {
      kind: "preset";
      presetId: number;
      presetName: string;
      task: Task;
      model: string;
      system?: string;
      temperature?: number;
    };

interface ChatRoutingValue {
  routing: ChatRoutingSelection;
  setRouting: (next: ChatRoutingSelection) => void;
}

const ChatRoutingContext = createContext<ChatRoutingValue | null>(null);

export function ChatRoutingProvider({ children }: { children: React.ReactNode }) {
  const [routing, setRouting] = useState<ChatRoutingSelection>({ kind: "auto" });
  return (
    <ChatRoutingContext.Provider value={{ routing, setRouting }}>
      {children}
    </ChatRoutingContext.Provider>
  );
}

export function useChatRouting(): ChatRoutingValue {
  const context = useContext(ChatRoutingContext);
  if (!context) {
    throw new Error("useChatRouting must be used within ChatRoutingProvider");
  }
  return context;
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

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

// Read-only summary of the shared chat-routing selection, shown outside
// Chat itself (e.g. All Tools' header) — mirrors the display pills in
// chat-thread-view.tsx's own header (docs/redesign-references/approved/
// all-tools.png shows the same "GPT-4o | Chat | Data Analysis" cluster
// top-right there as on Chat). Read-only: the full pickers (ModelPicker,
// ChatModeMenu) live in Chat's composer, not duplicated here.
export function WorkspaceContextPills() {
  const { routing, setRouting } = useChatRouting();
  return (
    <div className="chat-context-toolbar" role="toolbar" aria-label="Контекст Lumenza">
      <Link href="/chat" className="chat-context-display-pill">
        <i aria-hidden="true">✦</i> {routing.kind === "model" ? modelLabel(routing.model) : "Автовыбор"}
      </Link>
      <Link href="/chat" className="chat-context-display-pill">
        <i aria-hidden="true">◯</i> Chat
      </Link>
      {routing.kind === "task" && (
        <button
          type="button"
          onClick={() => setRouting({ kind: "auto" })}
          aria-label={`Убрать фокус: ${TASK_LABELS[routing.task]}`}
          className="chat-context-capability-pill"
        >
          <i aria-hidden="true">▥</i> {TASK_LABELS[routing.task]}
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}
