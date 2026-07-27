"use client";

import type { TaskOrImageTask } from "@/lib/api";

interface Option {
  value: TaskOrImageTask;
  label: string;
  hint: string;
}

interface OptionPickerProps {
  ariaLabel: string;
  options: Option[];
  selected: string;
  onSelect: (value: TaskOrImageTask) => void;
  className?: string;
}

const DEFAULT_CLASS_NAME =
  "flex flex-wrap items-center gap-1 self-start rounded-md border border-border bg-surface p-1";

export function OptionPicker({
  ariaLabel,
  options,
  selected,
  onSelect,
  className = DEFAULT_CLASS_NAME,
}: OptionPickerProps) {
  return (
    <div role="group" aria-label={ariaLabel} className={className}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.hint}
          aria-label={option.label}
          aria-pressed={selected === option.value}
          onClick={() => onSelect(option.value)}
          className={`inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors duration-150 ${
            selected === option.value
              ? "bg-primary text-bg"
              : "text-muted hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
