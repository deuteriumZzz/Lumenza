"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import {
  AnimatePresence,
  motion,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import { Images } from "@/app/images/page";
import { Voice } from "@/app/voice/page";
import { Documents } from "@/app/documents/page";
import { Analyze } from "@/app/analyze/page";
import { StudioMark } from "@/components/studio-mark";
import { motionTokens, springs } from "@/lib/motion";

type Mode = "images" | "voice" | "documents" | "analyze";

const MODES: { key: Mode; icon: string; label: string }[] = [
  { key: "images", icon: "🎨", label: "Картинки" },
  { key: "voice", icon: "🎙️", label: "Голос" },
  { key: "documents", icon: "📄", label: "Документы" },
  { key: "analyze", icon: "🖼️", label: "Анализ фото" },
];

export default function StudioPage() {
  return (
    /* useSearchParams() выводит поддерево из статического рендеринга,
       если оно не изолировано за Suspense — тот же паттерн, что уже
       есть в register/page.tsx. */
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}

// Творческая студия — Картинки/Голос/Документы/Анализ под одной pill-панелью,
// как раньше в единой /chat, но без вкладки "Текст": обычный чат теперь
// живёт отдельно на /chat как тредовый (как ChatGPT), а сюда переехало всё,
// что "производит" контент, а не просто отвечает текстом. Каждый режим —
// тот же компонент/эндпоинты, что и раньше, перенос навигации, а не новый
// функционал.
function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  // ?mode=voice&autostart=1 — так сюда попадает глобальный хоткей живого
  // голоса (GlobalHotkeys) из любого места приложения, не только когда
  // пользователь уже открыл вкладку "Голос" вручную.
  const queryKey = searchParams.toString();
  const requestedMode = parseMode(searchParams.get("mode"));
  const autoStart = searchParams.get("autostart") === "1";
  const [modeState, setModeState] = useState<{
    queryKey: string;
    mode: Mode;
  }>(() => ({ queryKey, mode: requestedMode ?? "images" }));

  if (modeState.queryKey !== queryKey) {
    setModeState({
      queryKey,
      mode: requestedMode ?? modeState.mode,
    });
  }

  const mode = modeState.mode;

  function selectMode(nextMode: Mode) {
    if (nextMode === mode) return;
    setModeState({ queryKey, mode: nextMode });
    if (queryKey) router.replace("/studio", { scroll: false });
  }

  return (
    <div className="flex flex-1 flex-col">
      <motion.nav
        data-testid="studio-mode-navigation"
        aria-label="Режим студии"
        initial={
          shouldReduceMotion
            ? false
            : { opacity: 0, y: -motionTokens.distance.sm }
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: shouldReduceMotion ? 0 : motionTokens.duration.normal,
          delay: shouldReduceMotion ? 0 : motionTokens.duration.fast,
          ease: motionTokens.easing.smooth,
        }}
        className="mx-auto mt-4 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 px-6"
      >
        <span
          data-testid="studio-navigation-mark"
          className="studio-navigation-mark"
          title="Lumenza Studio"
        >
          <StudioMark active className="size-5" />
        </span>
        {MODES.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={mode === option.key}
            onClick={() => selectMode(option.key)}
            className={`relative isolate inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3.5 py-1.5 text-sm transition-colors duration-150 ${
              mode === option.key
                ? "border-primary/50 text-ink"
                : "border-border bg-surface/75 text-muted hover:border-primary/25 hover:text-ink"
            }`}
          >
            {mode === option.key && (
              <motion.span
                layoutId="studio-active-mode"
                data-testid="studio-active-indicator"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-primary/12"
                transition={shouldReduceMotion ? { duration: 0 } : springs.snappy}
              />
            )}
            <span aria-hidden="true" className="relative">{option.icon}</span>
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </motion.nav>

      <div className="studio-mode-stage">
        <AnimatePresence mode="sync" initial={false}>
          <StudioModePanel
            key={`${mode}:${autoStart ? "autostart" : "manual"}`}
            mode={mode}
            autoStart={autoStart}
            shouldReduceMotion={Boolean(shouldReduceMotion)}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}

function parseMode(value: string | null): Mode | null {
  return MODES.some((mode) => mode.key === value) ? (value as Mode) : null;
}

function StudioModePanel({
  mode,
  autoStart,
  shouldReduceMotion,
}: {
  mode: Mode;
  autoStart: boolean;
  shouldReduceMotion: boolean;
}) {
  const isPresent = useIsPresent();

  return (
    <motion.div
      data-testid="studio-mode-panel"
      data-mode={mode}
      data-exiting={String(!isPresent)}
      aria-hidden={isPresent ? undefined : true}
      inert={isPresent ? undefined : true}
      initial={
        shouldReduceMotion
          ? false
          : {
              opacity: 0,
              y: motionTokens.distance.md,
              scale: motionTokens.scale.route,
            }
      }
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        shouldReduceMotion
          ? { opacity: 1 }
          : {
              opacity: 0,
              y: -motionTokens.distance.sm,
              scale: motionTokens.scale.route,
            }
      }
      transition={{
        duration: shouldReduceMotion ? 0 : motionTokens.duration.normal,
        ease: motionTokens.easing.smooth,
        opacity: {
          duration: shouldReduceMotion ? 0 : motionTokens.duration.fast,
        },
      }}
      className="studio-mode-panel"
    >
      {mode === "images" && <Images />}
      {mode === "voice" && <Voice autoStart={autoStart} />}
      {mode === "documents" && <Documents />}
      {mode === "analyze" && <Analyze />}
    </motion.div>
  );
}
