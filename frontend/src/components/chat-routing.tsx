"use client";

import { createContext, useContext, useState } from "react";
import type { Task } from "@/lib/api";

export type ChatRoutingSelection =
  | { kind: "auto" }
  | { kind: "task"; task: Task }
  | { kind: "model"; task: Task; model: string };

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
