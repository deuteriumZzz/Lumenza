"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { api, ApiError, type HistoryEntry, type Paginated } from "@/lib/api";

export default function HistoryPage() {
  return (
    <RequireAuth>
      <History />
    </RequireAuth>
  );
}

const STATUS_STYLE: Record<HistoryEntry["status"], string> = {
  ok: "bg-success",
  error: "bg-danger",
  insufficient_credits: "bg-surface-raised text-muted",
};

const STATUS_LABEL: Record<HistoryEntry["status"], string> = {
  ok: "ok",
  error: "error",
  insufficient_credits: "insufficient credits",
};

function History() {
  const [page, setPage] = useState(1);
  // `result` tags each response with the page it answers, so "loading" can
  // be derived (result's page hasn't caught up to the requested page) rather
  // than tracked as a separate flag that would need a synchronous setState
  // at the top of the effect below.
  const [result, setResult] = useState<{ page: number; data: Paginated<HistoryEntry> } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.history(page).then(
      (data) => {
        if (cancelled) return;
        setResult({ page, data });
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Couldn't load history.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [page]);

  const loading = !error && result?.page !== page;
  const data = result?.page === page ? result.data : null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">History</h1>
      <p className="mt-1 text-sm text-muted">Every request, with the credits it charged.</p>

      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && loading && <p className="mt-10 text-sm text-muted">Loading…</p>}

      {!error && !loading && data && data.results.length === 0 && (
        <p className="mt-10 text-sm text-muted">No requests yet — start a chat to see it here.</p>
      )}

      {!error && !loading && data && data.results.length > 0 && (
        <div className="mt-6 divide-y divide-border border-t border-border">
          {data.results.map((entry) => (
            <div key={entry.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-3 text-sm">
              <div>
                <div className="text-ink">
                  {entry.provider}/{entry.model}
                  <span className="ml-2 text-xs text-muted">{entry.mode}</span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {new Date(entry.created_at).toLocaleString()}
                  {entry.used_fallback && <span className="ml-2">· fallback used</span>}
                  {entry.mocked && <span className="ml-2">· mock</span>}
                </div>
              </div>
              <span className={`status-pill ${STATUS_STYLE[entry.status]}`}>{STATUS_LABEL[entry.status]}</span>
              <span className="w-20 text-right font-mono tabular-nums text-ink">{entry.credits_charged}</span>
            </div>
          ))}
        </div>
      )}

      {data && (data.next || data.previous) && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            disabled={!data.previous}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn-secondary disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!data.next}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
