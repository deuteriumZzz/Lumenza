"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { getWorkspaceSection } from "@/lib/workspace-sections";

export type StudioMode = "images" | "voice" | "documents" | "analyze";
export type Zone = "desk" | "studio" | "voice" | "archive";

// Какой режим Студии принадлежит какой "зоне" — см. раздел Zones в
// DESIGN.md. images/analyze делят тёплую "studio"-зону (см. globals.css),
// voice — своя холодная зона, documents — нейтральная "archive".
const STUDIO_MODE_ZONE: Record<StudioMode, Zone> = {
  images: "studio",
  analyze: "studio",
  voice: "voice",
  documents: "archive",
};

interface ZoneContextValue {
  zone: Zone;
  setStudioMode: (mode: StudioMode) => void;
}

const ZoneContext = createContext<ZoneContextValue | null>(null);

// Владелец зоны для всего приложения: и AmbientNetworkBackground (глобальный
// fixed-слой, живёт ВЫШЕ этого провайдера в дереве, см. AppBackdrop), и
// ZoneScope (тонировка контента) читают один и тот же .zone — иначе фон и
// контент могли бы разъехаться между "мы на /studio" и "какой именно режим
// Студии выбран сейчас", а второе меняется через локальный state страницы
// Studio, а не через pathname.
export function ZoneProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [studioMode, setStudioMode] = useState<StudioMode>("images");
  const section = getWorkspaceSection(pathname);
  const zone: Zone =
    section?.key === "studio" ? STUDIO_MODE_ZONE[studioMode] : "desk";

  return (
    <ZoneContext.Provider value={{ zone, setStudioMode }}>
      {children}
    </ZoneContext.Provider>
  );
}

function useZoneContext(): ZoneContextValue {
  const context = useContext(ZoneContext);
  if (!context) throw new Error("useZone must be used within ZoneProvider");
  return context;
}

export function useZone(): Zone {
  return useZoneContext().zone;
}

export function useSetStudioMode(): (mode: StudioMode) => void {
  return useZoneContext().setStudioMode;
}

// Намеренно ограничено областью контента, а не <body> — Nav находится вне
// этой обёртки (см. layout.tsx), так что постоянный chrome никогда не
// мерцает между зонами, мерцает только содержимое страницы под ним.
export function ZoneScope({ children }: { children: React.ReactNode }) {
  const zone = useZone();
  return (
    <div data-zone={zone} className="zone-scope zone-surface flex flex-1 flex-col">
      {children}
    </div>
  );
}
