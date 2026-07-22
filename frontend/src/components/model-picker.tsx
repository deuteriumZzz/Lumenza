"use client";

import type { ModelProgress } from "@/lib/api";

interface ModelPickerProps {
  models: ModelProgress[];
  selectedModel: string | null;
  onSelect: (model: string | null) => void;
}

function modelLabel(model: string): string {
  return model.includes("/") ? model.split("/").pop()! : model;
}

export function ModelPicker({ models, selectedModel, onSelect }: ModelPickerProps) {
  return (
    <label className="flex w-fit items-center gap-2 text-xs text-muted">
      <span>Модель</span>
      <select
        value={selectedModel ?? ""}
        onChange={(event) => onSelect(event.target.value || null)}
        className="max-w-64 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-ink outline-none"
      >
        <option value="">Авто</option>
        {models.map((entry) => {
          const label = modelLabel(entry.model);
          const labelWithProvider = `${label} · ${entry.provider}`;
          const progress = `${entry.current_requests}/${entry.target_requests} запросов, ${entry.current_days}/${entry.target_days} дней`;
          return (
            <option
              key={`${entry.provider}/${entry.model}`}
              value={entry.model}
              disabled={!entry.unlocked}
            >
              {entry.unlocked
                ? labelWithProvider
                : `${labelWithProvider} — заблокировано: ${progress}`}
            </option>
          );
        })}
      </select>
    </label>
  );
}
