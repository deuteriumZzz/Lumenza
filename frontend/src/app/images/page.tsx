"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError, type GeneratedImageEntry, type ImageProvider, type Paginated } from "@/lib/api";

const PROVIDERS: { value: ImageProvider; label: string; hint: string }[] = [
  { value: "openai", label: "OpenAI", hint: "Best quality" },
  { value: "flux", label: "Flux", hint: "Fast and cheap" },
];

const IN_PROGRESS = new Set<GeneratedImageEntry["status"]>(["pending", "processing"]);
const POLL_INTERVAL_MS = 2000;

const STATUS_STYLE: Record<GeneratedImageEntry["status"], string> = {
  pending: "bg-surface-raised text-muted",
  processing: "bg-surface-raised text-muted",
  ok: "bg-success",
  error: "bg-danger",
  insufficient_credits: "bg-surface-raised text-muted",
  blocked: "bg-surface-raised text-muted",
};

export default function ImagesPage() {
  return (
    <RequireAuth>
      <Images />
    </RequireAuth>
  );
}

function Images() {
  const { refreshBalance } = useAuth();
  const [page, setPage] = useState(1);
  // Same page-tagging pattern as the history page: derive `loading` instead
  // of tracking it as a separate flag that would need a synchronous
  // setState at the top of the fetch effect below.
  const [result, setResult] = useState<{ page: number; data: Paginated<GeneratedImageEntry> } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [provider, setProvider] = useState<ImageProvider>("openai");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.images(page).then(
      (data) => {
        if (cancelled) return;
        setResult({ page, data });
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Couldn't load images.");
      }
    );
    return () => {
      cancelled = true;
    };
  }, [page]);

  const loading = !error && result?.page !== page;
  const data = result?.page === page ? result.data : null;

  // Poll any still-in-progress entries on the current page until they settle.
  useEffect(() => {
    const inProgress = data?.results.filter((entry) => IN_PROGRESS.has(entry.status)) ?? [];
    if (inProgress.length === 0) return;

    let cancelled = false;

    const timer = setInterval(() => {
      Promise.all(inProgress.map((entry) => api.image(entry.id).catch(() => null))).then((updates) => {
        if (cancelled) return;
        const settled = updates.filter(
          (entry): entry is GeneratedImageEntry => entry !== null && !IN_PROGRESS.has(entry.status)
        );
        const byId = new Map(settled.map((entry) => [entry.id, entry]));
        if (byId.size === 0) return;
        setResult((prev) =>
          prev
            ? {
                ...prev,
                data: {
                  ...prev.data,
                  results: prev.data.results.map((entry) => byId.get(entry.id) ?? entry),
                },
              }
            : prev
        );
        // The hold placed at creation time is reconciled (refunded or
        // finalized) once the task settles — refresh the header balance
        // now rather than leaving it showing the stale hold-deducted value
        // until the user happens to navigate elsewhere.
        void refreshBalance();
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [data, refreshBalance]);

  async function generate() {
    const trimmed = prompt.trim();
    if (!trimmed || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await api.createImage(trimmed, provider);
      setPrompt("");
      // The credit hold for this request was already charged synchronously
      // on the backend before it returned 202 — reflect that immediately.
      void refreshBalance();
      if (page === 1) {
        setResult((prev) =>
          prev
            ? { ...prev, data: { ...prev.data, count: prev.data.count + 1, results: [created, ...prev.data.results] } }
            : prev
        );
      } else {
        setPage(1);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setSubmitError("Not enough credits for this request.");
      } else {
        setSubmitError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Images</h1>
      <p className="mt-1 text-sm text-muted">
        Generate visuals for your posts — results land in the gallery below.
      </p>

      <div className="mt-6 flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <div
          role="group"
          aria-label="Image provider"
          className="flex items-center gap-1 self-start rounded-md border border-border bg-bg p-1"
        >
          {PROVIDERS.map((option) => (
            <button
              key={option.value}
              type="button"
              title={option.hint}
              aria-pressed={provider === option.value}
              onClick={() => setProvider(option.value)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                provider === option.value ? "bg-primary text-bg" : "text-muted hover:text-ink"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-3">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the visual for your post…"
            aria-label="Image prompt"
            rows={2}
            maxLength={4000}
            className="input flex-1 resize-none"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={submitting || !prompt.trim()}
            className="btn-primary h-fit"
          >
            {submitting ? "Generating…" : "Generate"}
          </button>
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && loading && <p className="mt-10 text-sm text-muted">Loading…</p>}

      {!error && !loading && data && data.results.length === 0 && (
        <p className="mt-10 text-sm text-muted">No visuals yet — generate one above.</p>
      )}

      {!error && data && data.results.length > 0 && (
        <div
          className="mt-8 grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
        >
          {data.results.map((entry) => (
            <ImageCard key={entry.id} entry={entry} />
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

function ImageCard({ entry }: { entry: GeneratedImageEntry }) {
  const inProgress = IN_PROGRESS.has(entry.status);
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex aspect-square items-center justify-center bg-bg">
        {entry.image_url ? (
          // Served from our own Django media backend at an arbitrary dev
          // origin — next/image would need remotePatterns configured per
          // environment for no real benefit here (these aren't
          // publicly cacheable static assets).
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.image_url} alt={entry.prompt} className="h-full w-full object-cover" />
        ) : inProgress ? (
          <span className="text-xs text-muted" aria-live="polite">
            Generating…
          </span>
        ) : (
          <span className="text-xs text-muted">No image</span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <p className="line-clamp-2 text-xs text-muted">{entry.prompt}</p>
        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted">
          <span className={`status-pill ${STATUS_STYLE[entry.status]}`} aria-live="polite">
            {entry.status}
          </span>
          <span>{entry.credits_charged}</span>
        </div>
      </div>
    </div>
  );
}
