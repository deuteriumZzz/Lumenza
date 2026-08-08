"use client";

import { useState, type FormEvent } from "react";
import type { HistoryEntry, HistoryQuery, Task } from "@/lib/api";

export interface FilterForm {
  task: "" | Task;
  provider: string;
  status: "" | HistoryEntry["status"];
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_FILTERS: FilterForm = {
  task: "",
  provider: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

const TASK_OPTIONS: { value: Task; label: string }[] = [
  { value: "hook", label: "Хук" },
  { value: "longform", label: "Лонгформ" },
  { value: "hashtags", label: "Хэштеги" },
  { value: "content_plan", label: "Контент-план" },
  { value: "repurpose", label: "Репёрпоз" },
  { value: "translation", label: "Перевод" },
];

const PROVIDER_OPTIONS = ["openai", "anthropic", "google", "nvidia"];

const STATUS_OPTIONS: {
  value: HistoryEntry["status"];
  label: string;
}[] = [
  { value: "ok", label: "ОК" },
  { value: "error", label: "Ошибка" },
  { value: "insufficient_credits", label: "Недостаточно кредитов" },
  { value: "blocked", label: "Заблокировано" },
  { value: "task_locked", label: "Задача заблокирована" },
  { value: "model_locked", label: "Модель заблокирована" },
];

export function localDateBoundary(value: string, nextDay = false): string {
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

// Обратное преобразование к localDateBoundary — восстанавливает значение
// для <input type="date"> из ISO-строки, сохранённой в URL (см. history/page.tsx).
export function isoToLocalDateInput(iso: string, nextDay = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (nextDay) date.setDate(date.getDate() - 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildHistoryQuery(form: FilterForm): HistoryQuery {
  const filters: HistoryQuery = {};
  if (form.task) filters.task = form.task;
  if (form.provider) filters.provider = form.provider;
  if (form.status) filters.status = form.status;
  if (form.dateFrom) {
    filters.created_after = localDateBoundary(form.dateFrom);
  }
  if (form.dateTo) {
    filters.created_before = localDateBoundary(form.dateTo, true);
  }
  return filters;
}

export function HistoryFilters({
  onApply,
  initialValues,
}: {
  onApply: (filters: HistoryQuery) => void;
  initialValues?: Partial<FilterForm>;
}) {
  const [form, setForm] = useState<FilterForm>({ ...EMPTY_FILTERS, ...initialValues });
  const [error, setError] = useState<string | null>(null);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      setError("Дата «с» не может быть позже даты «по».");
      return;
    }

    setError(null);
    onApply(buildHistoryQuery(form));
  }

  function clearFilters() {
    setForm({ ...EMPTY_FILTERS });
    setError(null);
    onApply({});
  }

  const fieldClass = "input min-w-0 py-2 text-sm";

  return (
    <form
      aria-label="Фильтры истории"
      onSubmit={applyFilters}
      className="mt-6 rounded-md border border-border bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Задача
          <select
            aria-label="Задача"
            value={form.task}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                task: event.target.value as FilterForm["task"],
              }))
            }
            className={fieldClass}
          >
            <option value="">Все задачи</option>
            {TASK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Провайдер
          <select
            aria-label="Провайдер"
            value={form.provider}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                provider: event.target.value,
              }))
            }
            className={fieldClass}
          >
            <option value="">Все провайдеры</option>
            {PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Статус
          <select
            aria-label="Статус"
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as FilterForm["status"],
              }))
            }
            className={fieldClass}
          >
            <option value="">Все статусы</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          С даты
          <input
            type="date"
            aria-label="С даты"
            value={form.dateFrom}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                dateFrom: event.target.value,
              }))
            }
            className={fieldClass}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          По дату
          <input
            type="date"
            aria-label="По дату"
            value={form.dateTo}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                dateTo: event.target.value,
              }))
            }
            className={fieldClass}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="btn-primary px-3 py-1.5 text-xs">
          Применить фильтры
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Сбросить фильтры
        </button>
      </div>
    </form>
  );
}
