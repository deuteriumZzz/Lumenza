"use client";

import { useEffect, useState } from "react";
import { HistoryFilters } from "@/components/history-filters";
import { RequireAuth } from "@/components/require-auth";
import {
  api,
  apiErrorMessage,
  type HistoryEntry,
  type HistoryQuery,
  type Paginated,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";

export default function HistoryPage() {
  return (
    <RequireAuth>
      <History />
    </RequireAuth>
  );
}

const STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  ok: "ок",
  error: "ошибка",
  insufficient_credits: "недостаточно кредитов",
  blocked: "заблокировано",
  task_locked: "задача заблокирована",
  model_locked: "модель заблокирована",
};

function History() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<HistoryQuery>({});
  // `result` помечает каждый ответ страницей, на которую он отвечает, так
  // что "loading" можно вывести (страница result ещё не догнала запрошенную
  // страницу), а не отслеживать как отдельный флаг, для которого
  // понадобился бы синхронный setState в начале эффекта ниже.
  const [result, setResult] = useState<{
    requestKey: string;
    data: Paginated<HistoryEntry>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = JSON.stringify({ page, filters });

  useEffect(() => {
    let cancelled = false;
    api.history(page, filters).then(
      (data) => {
        if (cancelled) return;
        setResult({ requestKey, data });
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Не удалось загрузить историю."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [filters, page, requestKey]);

  const loading = !error && result?.requestKey !== requestKey;
  const data = result?.requestKey === requestKey ? result.data : null;
  const filtersActive = Object.keys(filters).length > 0;

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <header
        data-testid="workspace-page-header"
        className="flex flex-col gap-6 border-b border-border/70 pb-8 md:flex-row md:items-end md:justify-between"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Активность пространства
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
            История
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
            Все запросы, модели и списания кредитов в одном журнале. Фильтры помогают
            быстро восстановить контекст прошлой работы.
          </p>
        </div>
        <div className="min-w-36 border-l border-primary/40 pl-4 md:text-right">
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Записей найдено</p>
          <p className="mt-1 font-mono text-2xl tabular-nums text-ink">
            {data ? data.count : "—"}
          </p>
        </div>
      </header>

      <div className="mt-7">
        <HistoryFilters
          onApply={(nextFilters) => {
            setFilters(nextFilters);
            setPage(1);
            setError(null);
          }}
        />
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && loading && (
        <div role="status" className="mt-7 overflow-hidden rounded-2xl border border-border/70 bg-surface/65">
          <div className="h-11 border-b border-border/70 bg-surface-raised/30" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="grid grid-cols-[1fr_7rem_6rem] gap-4 border-b border-border/50 px-5 py-5 last:border-0">
              <span className="h-4 animate-pulse rounded bg-surface-raised" />
              <span className="h-4 animate-pulse rounded bg-surface-raised" />
              <span className="h-4 animate-pulse rounded bg-surface-raised" />
            </div>
          ))}
          <span className="sr-only">Загрузка…</span>
        </div>
      )}

      {!error && !loading && data && data.results.length === 0 && (
        <div className="mt-7 rounded-2xl border border-border/70 bg-surface/60 px-6 py-12 text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-xl border border-primary/25 bg-primary/8 text-primary">
            <span aria-hidden="true" className="font-mono text-base">↗</span>
          </div>
          <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted">
            {filtersActive
              ? "Нет запросов, подходящих под эти фильтры."
              : "Пока нет запросов — начните чат, чтобы увидеть их здесь."}
          </p>
        </div>
      )}

      {!error && !loading && data && data.results.length > 0 && (
        <div className="mt-7 overflow-hidden rounded-2xl border border-border/70 bg-surface/60 shadow-[0_20px_60px_color-mix(in_oklch,var(--color-bg)_72%,transparent)]">
          <div className="overflow-x-auto">
            <table aria-label="История запросов" className="w-full min-w-[44rem] border-collapse text-left">
              <thead className="border-b border-border/70 bg-surface-raised/25 text-[11px] uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3.5 font-medium">Модель и задача</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Время</th>
                  <th scope="col" className="px-5 py-3.5 font-medium">Статус</th>
                  <th scope="col" className="px-5 py-3.5 text-right font-medium">Кредиты</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {data.results.map((entry) => (
                  <tr key={entry.id} className="transition-colors duration-200 hover:bg-primary/[0.035]">
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-ink">{entry.model}</p>
                      <p className="mt-1 text-xs text-muted">{entry.provider} · {entry.task}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted">
                      <p>{new Date(entry.created_at).toLocaleString()}</p>
                      {(entry.used_fallback || entry.mocked) && (
                        <p className="mt-1">
                          {entry.used_fallback && "резервный маршрут"}
                          {entry.used_fallback && entry.mocked && " · "}
                          {entry.mocked && "тестовый ответ"}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`status-pill ${statusPillClass(entry.status)}`}>
                        {STATUS_LABEL[entry.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-mono text-sm tabular-nums text-ink">
                      {entry.credits_charged}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && (data.next || data.previous) && (
        <nav aria-label="Страницы истории" className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={!data.previous}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-secondary disabled:opacity-40"
          >
            Назад
          </button>
          <button
            type="button"
            disabled={!data.next}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary disabled:opacity-40"
          >
            Далее
          </button>
        </nav>
      )}
    </section>
  );
}
