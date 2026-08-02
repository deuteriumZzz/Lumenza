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
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <header
        data-testid="workspace-page-header"
        className="flex flex-col gap-6 border-b border-border/70 pb-8 md:flex-row md:items-end md:justify-between"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">
            Аккаунт и лимиты
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
            Использование
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Запросы, токены и списанные кредиты сгруппированы по моделям.
            Учитываются только успешно завершённые операции.
          </p>
        </div>
        <p className="max-w-52 text-xs leading-5 text-muted md:text-right">
          Данные обновляются после завершения каждого ответа.
        </p>
      </header>

      {error ? (
        <div role="alert" className="mt-8 rounded-2xl border border-danger/40 bg-danger/8 p-6 text-sm text-danger">
          {error}
        </div>
      ) : summary === null ? (
        <div role="status" className="mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <span key={item} className="h-32 animate-pulse rounded-2xl border border-border/60 bg-surface/60" />
          ))}
          <span className="sr-only">Загрузка статистики…</span>
        </div>
      ) : summary.by_model.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border/70 bg-surface/60 p-10 text-center">
          <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
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
          <section aria-label="Общие показатели" className="mt-8 grid gap-4 md:grid-cols-[1.4fr_1fr_1fr]">
            <UsageMetric label="Всего токенов" value={formatNumber(summary.total.total_tokens)} primary />
            <UsageMetric label="Списано кредитов" value={formatNumber(Number(summary.total.credits_charged), 4)} />
            <UsageMetric label="Успешные запросы" value={requestLabel(summary.total.requests)} />
          </section>

          <section className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-surface/60">
            <div className="flex items-center justify-between gap-4 border-b border-border/70 px-5 py-5 sm:px-6">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Распределение</p>
                <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">По моделям</h2>
              </div>
              <p className="font-mono text-xs tabular-nums text-muted">{summary.by_model.length} моделей</p>
            </div>
            <div className="overflow-x-auto">
              <table aria-label="Использование по моделям" className="w-full min-w-[42rem] border-collapse text-left">
                <thead className="border-b border-border/60 bg-surface-raised/20 text-[11px] uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3.5 font-medium sm:px-6">Модель</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Токены</th>
                    <th scope="col" className="px-5 py-3.5 font-medium">Кредиты</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-medium sm:px-6">Запросы</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {summary.by_model.map((entry) => (
                    <tr key={`${entry.provider}:${entry.model}`} className="transition-colors duration-200 hover:bg-primary/[0.035]">
                      <th scope="row" className="px-5 py-5 font-normal sm:px-6">
                        <p className="max-w-xs truncate text-sm font-medium text-ink">{modelLabel(entry.model)}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted">{entry.provider}</p>
                      </th>
                      <td className="px-5 py-5"><UsageCell value={formatNumber(entry.total_tokens)} /></td>
                      <td className="px-5 py-5"><UsageCell value={formatNumber(Number(entry.credits_charged), 4)} /></td>
                      <td className="px-5 py-5 text-right sm:px-6"><UsageCell value={requestLabel(entry.requests)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}

function UsageMetric({ label, value, primary = false }: { label: string; value: string; primary?: boolean }) {
  return (
    <div className={`rounded-2xl border p-6 ${primary ? "border-primary/30 bg-primary/[0.065]" : "border-border/70 bg-surface/60"}`}>
      <p className={`text-[11px] uppercase tracking-[0.13em] ${primary ? "text-primary" : "text-muted"}`}>{label}</p>
      <p className={`mt-4 font-mono tabular-nums tracking-tight text-ink ${primary ? "text-3xl" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function UsageCell({ value }: { value: string }) {
  return (
    <span className="font-mono text-sm tabular-nums text-ink">{value}</span>
  );
}
