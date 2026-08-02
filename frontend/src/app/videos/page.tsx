"use client";

import { useEffect, useRef, useState } from "react";
import { redirect } from "next/navigation";
import { StudioPromptDock } from "@/components/studio-prompt-dock";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  apiErrorMessage,
  ApiError,
  type GeneratedVideoEntry,
  type Paginated,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";

const IN_PROGRESS = new Set<GeneratedVideoEntry["status"]>(["pending", "processing"]);
const POLL_INTERVAL_MS = 2000;

// /videos — то же самое переадресующее устройство, что и у /images: реальный
// UI живёт внутри /studio, этот путь остаётся рабочим для прямых ссылок.
export default function VideosPage() {
  redirect("/studio");
}

export function Videos({
  initialSubmode = "text",
}: {
  initialSubmode?: "text" | "image";
}) {
  const { refreshBalance } = useAuth();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ page: number; data: Paginated<GeneratedVideoEntry> } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [submode, setSubmode] = useState<"text" | "image">(initialSubmode);
  const [prompt, setPrompt] = useState("");
  const [startingFrame, setStartingFrame] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const frameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    api.videos(page).then(
      (data) => {
        if (cancelled) return;
        setResult({ page, data });
        setError(null);
      },
      (err) => {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Не удалось загрузить видео."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [page]);

  const loading = !error && result?.page !== page;
  const data = result?.page === page ? result.data : null;

  // Опрашивает все ещё выполняющиеся записи на текущей странице, пока они
  // не завершатся — тот же паттерн, что и у Images (images/page.tsx).
  useEffect(() => {
    const inProgress = data?.results.filter((entry) => IN_PROGRESS.has(entry.status)) ?? [];
    if (inProgress.length === 0) return;

    let cancelled = false;

    const timer = setInterval(() => {
      Promise.all(inProgress.map((entry) => api.video(entry.id).catch(() => null))).then((updates) => {
        if (cancelled) return;
        const settled = updates.filter(
          (entry): entry is GeneratedVideoEntry => entry !== null && !IN_PROGRESS.has(entry.status)
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
    if (submode === "image" && !startingFrame) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const created =
        submode === "image" && startingFrame
          ? await api.createVideoAnimation(trimmed, startingFrame)
          : await api.createVideo(trimmed);
      setPrompt("");
      setStartingFrame(null);
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
      if (err instanceof ApiError && (err.status === 402 || err.status === 403)) {
        setSubmitError(apiErrorMessage(err));
      } else {
        setSubmitError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="videos-content"
      className="studio-content studio-image-workspace mx-auto w-full max-w-[92rem] flex-1 px-3 pb-44 pt-2 min-[380px]:px-4 sm:px-8 lg:px-10"
    >
      <div className="studio-gallery-heading">
        <div>
          <p className="studio-kicker">Motion</p>
          <h2>Video workspace</h2>
          <p>
            {submode === "image"
              ? "Загрузите стартовый кадр и опишите движение."
              : "Опишите сцену — новые ролики появляются здесь."}
          </p>
        </div>
        <span>{data?.count ?? 0} creations</span>
      </div>

      <div className="studio-community-filters" aria-label="Режим видео">
        <button type="button" aria-pressed={submode === "text"} onClick={() => setSubmode("text")}>
          Text to video
        </button>
        <button type="button" aria-pressed={submode === "image"} onClick={() => setSubmode("image")}>
          Starting frame
        </button>
      </div>

      <input
        ref={frameInputRef}
        type="file"
        accept="image/*"
        aria-label="Стартовый кадр"
        onChange={(event) => setStartingFrame(event.target.files?.[0] ?? null)}
        className="sr-only"
      />

      {error && (
        <p role="alert" className="studio-gallery-notice text-danger">
          {error}
        </p>
      )}

      {!error && loading && <p role="status" className="studio-gallery-notice">Загрузка…</p>}

      {!error && !loading && data && data.results.length === 0 && (
        <div className="studio-gallery-empty">
          <span aria-hidden="true">✦</span>
          <h3>Здесь появится ваш первый ролик</h3>
          <p>Опишите сцену и нажмите «Создать».</p>
        </div>
      )}

      {!error && data && data.results.length > 0 && (
        <div className="studio-generation-grid">
          {data.results.map((entry) => (
            <VideoCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {data && (data.next || data.previous) && (
        <div className="studio-gallery-pagination">
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
        </div>
      )}

      <StudioPromptDock
        mode="video"
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={() => void generate()}
        onAddReference={submode === "image" ? () => frameInputRef.current?.click() : undefined}
        submitDisabled={submode === "image" && !startingFrame}
        busy={submitting}
        referenceLabel={submode === "image" ? startingFrame?.name : undefined}
        status={submitError ?? undefined}
        placeholder={
          submode === "image"
            ? "Опишите, как должен двигаться загруженный кадр…"
            : "Опишите сцену и движение камеры…"
        }
      />
    </div>
  );
}

function VideoCard({ entry }: { entry: GeneratedVideoEntry }) {
  const inProgress = IN_PROGRESS.has(entry.status);
  return (
    <article className="studio-generation-card group">
      <div className="studio-generation-media">
        {entry.video_url ? (
          entry.mocked ? (
            // Заглушки — анимированный GIF (нет лёгкого чисто-питоновского
            // энкодера MP4 на бэкенде, см. videogen/mock.py), а не видео.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.video_url} alt={entry.prompt} className="h-full w-full object-cover" />
          ) : (
            <video src={entry.video_url} controls className="h-full w-full object-cover" />
          )
        ) : inProgress ? (
          <span className="text-xs text-muted" aria-live="polite">
            Генерируем…
          </span>
        ) : (
          <span className="text-xs text-muted">Нет видео</span>
        )}
      </div>
      <div className="studio-generation-meta">
        {entry.source_image_url && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.source_image_url}
              alt="Стартовый кадр"
              className="h-8 w-8 rounded object-cover"
            />
            <span className="text-[11px] text-muted">Стартовый кадр</span>
          </div>
        )}
        <p className="line-clamp-2 text-xs text-muted">{entry.prompt}</p>
        <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-muted">
          <span className={`status-pill ${statusPillClass(entry.status)}`} aria-live="polite">
            {entry.status}
          </span>
          <span>{entry.credits_charged}</span>
        </div>
      </div>
    </article>
  );
}
