"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ModelProgress } from "@/lib/api";
import { TASK_LABELS } from "@/lib/chat-taxonomy";
import { LumenzaMark } from "@/components/lumenza-brand";

interface ModelPickerProps {
  models: ModelProgress[];
  selectedModel: string | null;
  selectedTask?: string | null;
  onSelect: (model: string | null, task: string | null) => void;
}

interface ModelChoice {
  key: string;
  model: string;
  provider: string;
  entries: ModelProgress[];
  selectedEntry: ModelProgress;
  unlocked: boolean;
  accessClass: ModelProgress["access_class"];
}

const TASK_PRIORITY = [
  "repurpose",
  "longform",
  "translation",
  "search",
  "hook",
  "content_plan",
  "hashtags",
];

function modelLabel(model: string): string {
  return model.includes("/") ? model.split("/").pop()! : model;
}

function entryScore(entry: ModelProgress, selectedTask: string | null): number {
  if (entry.task === selectedTask && entry.unlocked) return -100;
  const taskIndex = TASK_PRIORITY.indexOf(entry.task);
  return (entry.unlocked ? 0 : 100) + (taskIndex === -1 ? 50 : taskIndex);
}

function buildChoices(models: ModelProgress[], selectedTask: string | null): ModelChoice[] {
  const grouped = new Map<string, ModelProgress[]>();

  for (const entry of models) {
    const key = `${entry.provider}\u0000${entry.model}`;
    grouped.set(key, [...(grouped.get(key) ?? []), entry]);
  }

  return Array.from(grouped.entries())
    .map(([key, entries]) => {
      const sortedEntries = [...entries].sort(
        (left, right) => entryScore(left, selectedTask) - entryScore(right, selectedTask),
      );
      const selectedEntry = sortedEntries[0];
      return {
        key,
        model: selectedEntry.model,
        provider: selectedEntry.provider,
        entries,
        selectedEntry,
        unlocked: entries.some((entry) => entry.unlocked),
        accessClass: selectedEntry.access_class,
      };
    })
    .sort((left, right) => {
      if (left.unlocked !== right.unlocked) return left.unlocked ? -1 : 1;
      return modelLabel(left.model).localeCompare(modelLabel(right.model));
    });
}

export function ModelPicker({
  models,
  selectedModel,
  selectedTask = null,
  onSelect,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showLocked, setShowLocked] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const choices = useMemo(
    () => buildChoices(models, selectedTask),
    [models, selectedTask],
  );
  const selectedChoice = choices.find(
    (choice) =>
      choice.model === selectedModel &&
      choice.entries.some((entry) => entry.task === selectedTask),
  );
  const filteredChoices = choices.filter((choice) => {
    const haystack = `${choice.model} ${choice.provider}`.toLocaleLowerCase();
    return haystack.includes(query.trim().toLocaleLowerCase());
  });
  const available = filteredChoices.filter((choice) => choice.unlocked);
  const locked = filteredChoices.filter((choice) => !choice.unlocked);
  const selectedLabel = selectedChoice
    ? `${modelLabel(selectedChoice.model)} · ${selectedChoice.provider}`
    : "Автовыбор";

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function select(choice: ModelChoice | null) {
    if (choice && !choice.unlocked) return;
    onSelect(
      choice?.model ?? null,
      choice?.selectedEntry.task ?? null,
    );
    setOpen(false);
    setQuery("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Модель: ${selectedLabel}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="model-picker-trigger"
      >
        <LumenzaMark className="model-picker-spark size-4" />
        <span className="max-w-44 truncate">{selectedLabel}</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="model-picker-popover">
          <div className="border-b border-border/70 p-2.5">
            <label className="relative block">
              <span className="sr-only">Найти модель</span>
              <svg aria-hidden="true" viewBox="0 0 20 20" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="9" cy="9" r="5.5" />
                <path d="m13 13 4 4" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти модель"
                className="w-full rounded-xl border border-border bg-bg/65 py-2 pl-9 pr-3 text-sm text-ink outline-none placeholder:text-muted focus:border-primary"
                autoFocus
              />
            </label>
          </div>

          <div role="dialog" aria-label="Выбор модели" className="max-h-[22rem] overflow-y-auto p-2">
            <button
              type="button"
              aria-pressed={selectedModel === null}
              onClick={() => select(null)}
              className="model-picker-option"
            >
              <span className="model-provider-mark bg-primary/15 text-primary" aria-hidden="true">A</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium text-ink">Автовыбор</span>
                <span className="block text-xs text-muted">Подберём маршрут под запрос</span>
              </span>
              {selectedModel === null && <span className="text-primary" aria-hidden="true">✓</span>}
            </button>

            {available.length > 0 && (
              <p className="px-2 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                Доступные
              </p>
            )}
            {available.map((choice) => (
              <ModelOption
                key={choice.key}
                choice={choice}
                selected={choice.key === selectedChoice?.key}
                onClick={() => select(choice)}
              />
            ))}

            {locked.length > 0 && (
              <button
                type="button"
                aria-expanded={showLocked}
                onClick={() => setShowLocked((current) => !current)}
                className="mt-2 flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                <span>Premium-модели · {locked.length}</span>
                <svg aria-hidden="true" viewBox="0 0 16 16" className={`size-3.5 transition-transform ${showLocked ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            {showLocked && locked.map((choice) => (
              <ModelOption
                key={choice.key}
                choice={choice}
                selected={false}
                onClick={() => undefined}
              />
            ))}

            {filteredChoices.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted">Модели не найдены</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelOption({
  choice,
  selected,
  onClick,
}: {
  choice: ModelChoice;
  selected: boolean;
  onClick: () => void;
}) {
  const taskSummary = Array.from(
    new Set(choice.entries.map((entry) => TASK_LABELS[entry.task] ?? entry.task)),
  ).slice(0, 2).join(" · ");
  const accessLabel =
    choice.accessClass === "premium" ? "Доступно в Pro" : "Недоступно";

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-disabled={!choice.unlocked}
      disabled={!choice.unlocked}
      onClick={onClick}
      className="model-picker-option"
    >
      <span className="model-provider-mark" aria-hidden="true">
        {choice.provider.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-ink">
          {modelLabel(choice.model)} <span className="font-normal text-muted">· {choice.provider}</span>
        </span>
        <span className="block truncate text-xs text-muted">
          {choice.unlocked ? taskSummary : accessLabel}
        </span>
      </span>
      {selected ? (
        <span className="text-primary" aria-hidden="true">✓</span>
      ) : !choice.unlocked ? (
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="4.5" y="8.5" width="11" height="8" rx="2" />
          <path d="M7 8.5V6.75a3 3 0 0 1 6 0V8.5" />
        </svg>
      ) : null}
    </button>
  );
}
