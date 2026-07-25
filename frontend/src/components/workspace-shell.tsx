"use client";

import { usePathname } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import { ThreadSidebar } from "@/components/thread-sidebar";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace =
    pathname.startsWith("/chat") || pathname.startsWith("/studio");

  if (!isWorkspace) return <>{children}</>;

  return (
    <RequireAuth>
      <div className="chat-shell relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <ThreadSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col pl-[4.5rem] md:pl-0">
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
