"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { Images } from "@/app/images/page";
import { Voice } from "@/app/voice/page";
import { Documents } from "@/app/documents/page";
import { Analyze } from "@/app/analyze/page";

type Mode = "images" | "voice" | "documents" | "analyze";

const MODES: { key: Mode; icon: string; label: string }[] = [
  { key: "images", icon: "🎨", label: "Картинки" },
  { key: "voice", icon: "🎙️", label: "Голос" },
  { key: "documents", icon: "📄", label: "Документы" },
  { key: "analyze", icon: "🖼️", label: "Анализ фото" },
];

export default function StudioPage() {
  return (
    <RequireAuth>
      {/* useSearchParams() выводит поддерево из статического рендеринга,
          если оно не изолировано за Suspense — тот же паттерн, что уже
          есть в register/page.tsx. */}
      <Suspense fallback={null}>
        <Studio />
      </Suspense>
    </RequireAuth>
  );
}

// Творческая студия — Картинки/Голос/Документы/Анализ под одной pill-панелью,
// как раньше в единой /chat, но без вкладки "Текст": обычный чат теперь
// живёт отдельно на /chat как тредовый (как ChatGPT), а сюда переехало всё,
// что "производит" контент, а не просто отвечает текстом. Каждый режим —
// тот же компонент/эндпоинты, что и раньше, перенос навигации, а не новый
// функционал.
function Studio() {
  const searchParams = useSearchParams();
  // ?mode=voice&autostart=1 — так сюда попадает глобальный хоткей живого
  // голоса (GlobalHotkeys) из любого места приложения, не только когда
  // пользователь уже открыл вкладку "Голос" вручную.
  const initialMode = searchParams.get("mode") === "voice" ? "voice" : "images";
  const autoStart = searchParams.get("autostart") === "1";
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="flex flex-1 flex-col">
      <nav
        aria-label="Режим студии"
        className="mx-auto mt-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 px-6"
      >
        {MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={mode === option.key}
            onClick={() => setMode(option.key)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150 ${
              mode === option.key
                ? "border-primary bg-primary/10 text-ink"
                : "border-border bg-surface text-muted hover:text-ink"
            }`}
          >
            <span aria-hidden="true">{option.icon}</span>
            {option.label}
          </button>
        ))}
      </nav>

      {mode === "images" && <Images />}
      {mode === "voice" && <Voice autoStart={autoStart} />}
      {mode === "documents" && <Documents />}
      {mode === "analyze" && <Analyze />}
    </div>
  );
}
