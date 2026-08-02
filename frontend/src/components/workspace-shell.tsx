"use client";

import { usePathname } from "next/navigation";
import { RequireAuth } from "@/components/require-auth";
import { ThreadSidebar } from "@/components/thread-sidebar";
import { isWorkspaceRoute } from "@/lib/workspace-sections";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWorkspace = isWorkspaceRoute(pathname);

  if (!isWorkspace) return <>{children}</>;

  return (
    <RequireAuth>
      <div
        data-testid="workspace-shell"
        data-shell-mode="unified"
        className="chat-shell relative flex max-h-dvh min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        <ThreadSidebar />
        <div
          data-testid="workspace-content"
          className="miniapp-workspace-content flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto"
        >
          {children}
        </div>
      </div>
    </RequireAuth>
  );
}
