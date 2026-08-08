"use client";

import { usePathname } from "next/navigation";
import { AmbientNetworkBackground } from "@/components/ambient-network-background";
import { BrandCursor } from "@/components/brand-cursor";
import { isWorkspaceRoute } from "@/lib/workspace-sections";

export function AppBackdrop({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // None of the 6 approved pixel-perfect redesign references
  // (docs/redesign-references/approved/) show this decorative network
  // layer on workspace routes — it's plain charcoal there. Login/register
  // and other marketing-ish routes are outside that redesign's scope, so
  // they keep it.
  const showNetworkBackground = !isWorkspaceRoute(pathname);

  return (
    <div className="contents">
      {showNetworkBackground && <AmbientNetworkBackground />}
      <BrandCursor />
      <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
    </div>
  );
}
