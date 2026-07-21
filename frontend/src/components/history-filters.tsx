"use client";

import { useState, type FormEvent } from "react";
import type { HistoryEntry, HistoryQuery, Task } from "@/lib/api";

interface FilterForm {
  task: "" | Task;
  provider: string;
  status: "" | HistoryEntry["status"];
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: FilterForm = {
  task: "",
  provider: "",
  status: "",
  dateFrom: "",
  dateTo: "",
};

const TASK_OPTIONS: { value: Task; label: string }[] = [
  { value: "hook", label: "Hook" },
  { value: "longform", label: "Long-form" },
  { value: "hashtags", label: "Hashtags" },
  { value: "content_plan", label: "Content plan" },
  { value: "repurpose", label: "Repurpose" },
  { value: "translation", label: "Translation" },
];

const PROVIDER_OPTIONS = ["openai", "anthropic", "google", "nvidia"];

const STATUS_OPTIONS: {
  value: HistoryEntry["status"];
  label: string;
}[] = [
  { value: "ok", label: "OK" },
  { value: "error", label: "Error" },
  { value: "insufficient_credits", label: "Insufficient credits" },
  { value: "blocked", label: "Blocked" },
  { value: "task_locked", label: "Task locked" },
  { value: "model_locked", label: "Model locked" },
];

function localDateBoundary(value: string, nextDay = false): string {
  const date = new Date(`${value}T00:00:00`);
  if (nextDay) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function HistoryFilters({
  onApply,
}: {
  onApply: (filters: HistoryQuery) => void;
}) {
  const [form, setForm] = useState<FilterForm>({ ...EMPTY_FILTERS });
  const [error, setError] = useState<string | null>(null);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    if (form.dateFrom && form.dateTo && form.dateFrom > form.dateTo) {
      setError("From date must not be after to date.");
      return;
    }

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
    setError(null);
    onApply(filters);
  }

  function clearFilters() {
    setForm({ ...EMPTY_FILTERS });
    setError(null);
    onApply({});
  }

  const fieldClass = "input min-w-0 py-2 text-sm";

  return (
    <form
      aria-label="History filters"
      onSubmit={applyFilters}
      className="mt-6 rounded-md border border-border bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Task
          <select
            aria-label="Task"
            value={form.task}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                task: event.target.value as FilterForm["task"],
              }))
            }
            className={fieldClass}
          >
            <option value="">All tasks</option>
            {TASK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Provider
          <select
            aria-label="Provider"
            value={form.provider}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                provider: event.target.value,
              }))
            }
            className={fieldClass}
          >
            <option value="">All providers</option>
            {PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          Status
          <select
            aria-label="Status"
            value={form.status}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                status: event.target.value as FilterForm["status"],
              }))
            }
            className={fieldClass}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
          From date
          <input
            type="date"
            aria-label="From date"
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
          To date
          <input
            type="date"
            aria-label="To date"
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
          Apply filters
        </button>
        <button
          type="button"
          onClick={clearFilters}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          Clear filters
        </button>
      </div>
    </form>
  );
}
