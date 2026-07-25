import { AmbientNetworkBackground } from "@/components/ambient-network-background";
import { BrandCursor } from "@/components/brand-cursor";

export function AppBackdrop({ children }: { children: React.ReactNode }) {
  return (
    <div className="contents">
      <AmbientNetworkBackground />
      <BrandCursor />
      <div className="relative z-10 flex min-h-full flex-1 flex-col">{children}</div>
    </div>
  );
}
