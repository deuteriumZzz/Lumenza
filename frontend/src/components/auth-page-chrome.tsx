import { AmbientNetworkBackground } from "@/components/ambient-network-background";
import { ModelMarquee } from "@/components/model-marquee";

// Общая обёртка для /login и /register — обе страницы самостоятельные,
// без общего layout.tsx, так что оборачиваем разметку напрямую, а не
// заводим новый route-group layout ради двух декоративных слоёв.
export function AuthPageChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col">
      <AmbientNetworkBackground />
      {children}
      <div className="border-t border-border px-6 py-3">
        <ModelMarquee />
      </div>
    </div>
  );
}
