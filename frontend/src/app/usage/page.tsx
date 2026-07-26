"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import {
  api,
  apiErrorMessage,
  type UsageSummary,
} from "@/lib/api";

const MODEL_LABELS: Record<string, string> = {
  "claude-3-5-sonnet-latest": "Claude 3.5 Sonnet",
  "gpt-4o-mini": "GPT-4o mini",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
};

function modelLabel(model: string) {
  return MODEL_LABELS[model] ?? (model.includes("/") ? model.split("/").pop()! : model);
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits,
  })
    .format(value)
    .replace(/[\u00a0\u202f]/g, " ");
}

function requestLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} запрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} запроса`;
  }
  return `${count} запросов`;
}

export default function UsagePage() {
  return (
    <RequireAuth>
      <Usage />
    </RequireAuth>
  );
}

function Usage() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.usageSummary().then(
      (result) => {
        if (!cancelled) setSummary(result);
      },
      (reason) => {
        if (!cancelled) {
          setError(
            apiErrorMessage(
              reason,
              "Не удалось загрузить статистику использования.",
            ),
          );
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Аккаунт
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
          Использование
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted">
          Запросы, токены и списанные кредиты сгруппированы по моделям.
          Учитываются только успешно завершённые операции.
        </p>
      </div>

      {error ? (
        <div role="alert" className="mt-8 rounded-2xl border border-danger/40 bg-danger/8 p-5 text-sm text-danger">
          {error}
        </div>
      ) : summary === null ? (
        <div role="status" className="mt-8 grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <span key={item} className="h-24 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : summary.by_model.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-surface p-8 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
            <span aria-hidden="true" className="text-lg">∿</span>
          </div>
          <h2 className="mt-4 text-base font-medium text-ink">
            Пока нет истории использования
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
            После первого ответа модели здесь появится подробная статистика.
          </p>
        </div>
      ) : (
        <>
          <section aria-label="Общие показатели" className="mt-8 grid gap-3 sm:grid-cols-3">
            <UsageMetric label="Всего токенов" value={formatNumber(summary.total.total_tokens)} />
            <UsageMetric label="Кредиты" value={formatNumber(Number(summary.total.credits_charged), 4)} />
            <UsageMetric label="Запросы" value={requestLabel(summary.total.requests)} />
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-medium text-ink">По моделям</h2>
            </div>
            <div className="divide-y divide-border">
              {summary.by_model.map((entry) => (
                <article
                  key={`${entry.provider}:${entry.model}`}
                  className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]"
                >
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-ink">
                      {modelLabel(entry.model)}
                    </h3>
                    <p className="mt-1 text-xs uppercase tracking-wide text-muted">
                      {entry.provider}
                    </p>
                  </div>
                  <UsageCell label="Токены" value={formatNumber(entry.total_tokens)} />
                  <UsageCell label="Кредиты" value={formatNumber(Number(entry.credits_charged), 4)} />
                  <UsageCell label="Запросы" value={requestLabel(entry.requests)} />
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function UsageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-mono text-xl tabular-nums text-ink">{value}</p>
    </div>
  );
}

function UsageCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-ink">{value}</p>
    </div>
  );
}
