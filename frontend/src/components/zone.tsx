"use client";

import { usePathname } from "next/navigation";

// Какой префикс роута принадлежит какой "зоне" — см. раздел Zones в
// DESIGN.md. Порядок важен только в том смысле, что более специфичные
// префиксы должны идти первыми, если они когда-нибудь пересекутся; сегодня
// таких нет. Роуты, не попавшие в список (chat, history, pricing, login,
// register), проваливаются в "desk", что намеренно ничего не делает —
// корневая палитра в globals.css УЖЕ и есть зона desk, так что для неё
// ничего нового рендерить не нужно.
const ZONE_BY_PREFIX: [string, string][] = [
  ["/images", "studio"],
  ["/analyze", "studio"],
  ["/voice", "voice"],
  ["/documents", "archive"],
];

function zoneForPath(pathname: string): string {
  for (const [prefix, zone] of ZONE_BY_PREFIX) {
    if (pathname.startsWith(prefix)) return zone;
  }
  return "desk";
}

// Намеренно ограничено областью контента, а не <body> — Nav находится вне
// этой обёртки (см. layout.tsx), так что постоянный chrome никогда не
// мерцает между зонами, мерцает только содержимое страницы под ним.
export function ZoneScope({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div data-zone={zoneForPath(pathname)} className="zone-scope flex flex-1 flex-col bg-bg">
      {children}
    </div>
  );
}
