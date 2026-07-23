"use client";

import { ChatThreadView } from "@/components/chat-thread-view";

// Состояние "новый чат" — тред ещё не создан, ChatThreadView создаёт его
// лениво при первом отправленном сообщении и переезжает на /chat/<id>.
export default function ChatPage() {
  return <ChatThreadView threadId={null} />;
}
