"use client";

import { usePathname } from "next/navigation";

// Какой префикс роута принадлежит какой "зоне" — см. раздел Zones в
// DESIGN.md. Роуты, не попавшие в список (chat, history, pricing, login,
// register), проваливаются в "desk", что намеренно ничего не делает —
// корневая палитра в globals.css УЖЕ и есть зона desk, так что для неё
// ничего нового рендерить не нужно.
//
// /images, /voice, /documents, /analyze раньше имели разные зоны, но с тех
// пор, как эти страницы стали чистыми redirect("/chat")/redirect("/studio")
// (единая творческая студия с переключением режима пилюлями, а не
// отдельными URL), pathname никогда не остаётся на этих префиксах достаточно
// долго, чтобы зона успела примениться — они были фактически мертвы. Вся
// студия теперь под одним "/studio", так что здесь одна зона на всю неё;
// тонкая тонировка по конкретному режиму пилюли — отдельная фича (нужен
// клиентский zone-context, реагирующий на выбранную пилюлю, а не на
// pathname).
const ZONE_BY_PREFIX: [string, string][] = [["/studio", "studio"]];

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
    <div
      data-zone={zoneForPath(pathname)}
      className="zone-scope zone-surface flex flex-1 flex-col"
    >
      {children}
    </div>
  );
}
