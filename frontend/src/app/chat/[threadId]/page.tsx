"use client";

import { useParams } from "next/navigation";
import { ChatThreadView } from "@/components/chat-thread-view";

export default function ThreadPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = Number(params.threadId);

  return <ChatThreadView threadId={threadId} />;
}
