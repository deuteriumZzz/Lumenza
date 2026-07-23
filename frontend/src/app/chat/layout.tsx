"use client";

import { RequireAuth } from "@/components/require-auth";
import { ThreadSidebar } from "@/components/thread-sidebar";

// Один RequireAuth на весь раздел /chat (а не в каждой странице отдельно,
// как исторически принято в проекте) — осознанное отступление: сайдбар
// тредов общий для /chat и /chat/[threadId], и именно для такого случая
// Next.js даёт вложенные layout'ы.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex flex-1">
        <ThreadSidebar />
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    </RequireAuth>
  );
}
