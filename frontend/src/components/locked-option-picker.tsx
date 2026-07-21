"use client";

import { ProgressRing } from "@/components/progress-ring";
import type { ResourceProgress, TaskOrImageTask } from "@/lib/api";

interface Option {
  value: TaskOrImageTask;
  label: string;
  hint: string;
}

interface LockedOptionPickerProps {
  ariaLabel: string;
  options: Option[];
  selected: string;
  onSelect: (value: TaskOrImageTask) => void;
  isUnlocked: (value: TaskOrImageTask) => boolean;
  progressFor: (value: TaskOrImageTask) => ResourceProgress | undefined;
  className?: string;
}

const DEFAULT_CLASS_NAME =
  "flex flex-wrap items-center gap-1 self-start rounded-md border border-border bg-surface p-1";

// Общий для chat (задачи и модели) и images (задачи) рендер кнопок с учётом
// разблокировки: сам прогресс/статус разблокировки приходит из
// useUnlockProgress, эта часть — только про кнопки.
export function LockedOptionPicker({
  ariaLabel,
  options,
  selected,
  onSelect,
  isUnlocked,
  progressFor,
  className = DEFAULT_CLASS_NAME,
}: LockedOptionPickerProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      {options.map((option) => {
        const unlocked = isUnlocked(option.value);
        const p = progressFor(option.value);
        // Разблокировка требует ОБА условия (см.
        // progression.services.check_and_unlock: count >= min_requests
        // and days >= min_distinct_days) — прогресс ограничен более
        // медленным из двух, не средним и не быстрым.
        const ratio = p
          ? Math.min(
              p.current_requests / Math.max(1, p.target_requests),
              p.current_days / Math.max(1, p.target_days)
            )
          : 0;
        const lockedHint = p
          ? `Locked — ${p.current_requests}/${p.target_requests} requests, ${p.current_days}/${p.target_days} days`
          : "Locked on your plan";
        return (
          <button
            key={option.value}
            type="button"
            title={unlocked ? option.hint : lockedHint}
            aria-pressed={selected === option.value}
            aria-disabled={!unlocked}
            onClick={() => unlocked && onSelect(option.value)}
            className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors duration-150 ${
              !unlocked
                ? "cursor-not-allowed text-muted/50"
                : selected === option.value
                  ? "bg-primary text-bg"
                  : "text-muted hover:text-ink"
            }`}
          >
            {!unlocked && (p ? <ProgressRing value={ratio} /> : <span aria-hidden="true">🔒</span>)}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
