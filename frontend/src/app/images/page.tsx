"use client";

import { useEffect, useState } from "react";
import { ImageLightbox } from "@/components/image-lightbox";
import { OptionPicker } from "@/components/option-picker";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  apiErrorMessage,
  ApiError,
  type GeneratedImageEntry,
  type ImageTask,
  type Paginated,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { redirect } from "next/navigation";

const TASKS: { value: ImageTask; label: string; hint: string }[] = [
  { value: "realistic", label: "Реализм", hint: "Лучшее качество, фотореалистично" },
  { value: "illustration", label: "Иллюстрация", hint: "Быстро и дёшево, стилизовано" },
  { value: "premium", label: "Премиум", hint: "Более высокое качество, универсальная генерация" },
];

const IN_PROGRESS = new Set<GeneratedImageEntry["status"]>(["pending", "processing"]);
const POLL_INTERVAL_MS = 2000;

// /images теперь режим внутри творческой студии (/studio) — старая прямая
// ссылка остаётся рабочей, просто ведёт туда же.
export default function ImagesPage() {
  redirect("/studio");
}

export function Images() {
  const { refreshBalance } = useAuth();
  const [page, setPage] = useState(1);
  // Тот же паттерн пометки страницы, что и на странице history: `loading`
  // выводится, а не отслеживается как отдельный флаг, для которого
  // понадобился бы синхронный setState в начале эффекта загрузки ниже.
  const [result, setResult] = useState<{ page: number; data: Paginated<GeneratedImageEntry> } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<"generate" | "edit">("generate");
  const [prompt, setPrompt] = useState("");
  const [task, setTask] = useState<ImageTask>("illustration");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);

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
        setError(apiErrorMessage(err, "Не удалось загрузить картинки."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [page]);

  const loading = !error && result?.page !== page;
  const data = result?.page === page ? result.data : null;

  // Опрашивает все ещё выполняющиеся записи на текущей странице, пока они не завершатся.
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
        // Резерв, поставленный в момент создания, сверяется (возвращается
        // или фиксируется) как только задача завершается — обновляем
        // баланс в шапке прямо сейчас, а не оставляем показывать устаревшее
        // значение с вычтенным резервом, пока пользователь случайно не
        // перейдёт куда-то ещё.
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
      const created = await api.createImage(trimmed, task);
      setPrompt("");
      // Резерв кредитов для этого запроса уже был синхронно списан на
      // бэкенде до того, как он вернул 202 — отражаем это немедленно.
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
        setSubmitError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setSubmitError(apiErrorMessage(err));
      } else {
        setSubmitError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitEdit() {
    const trimmed = editPrompt.trim();
    if (!trimmed || !editFile || editSubmitting) return;
    setEditSubmitError(null);
    setEditSubmitting(true);
    try {
      const created = await api.createImageEdit(trimmed, editFile);
      setEditPrompt("");
      setEditFile(null);
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
        setEditSubmitError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setEditSubmitError(apiErrorMessage(err));
      } else {
        setEditSubmitError(apiErrorMessage(err));
      }
    } finally {
      setEditSubmitting(false);
    }
  }

  return (
    <div
      data-testid="images-content"
      className="studio-content mx-auto w-full max-w-5xl flex-1 px-3 py-6 min-[380px]:px-4 sm:px-6 sm:py-10"
    >
      <h1 className="text-xl font-semibold tracking-tight text-ink">Картинки</h1>
      <p className="mt-1 text-sm text-muted">
        Создавайте и редактируйте изображения — результаты сохраняются в галерее ниже.
      </p>

      <div className="mt-6 flex min-w-0 flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:p-4">
        <div
          role="group"
          aria-label="Режим работы с картинкой"
          className="studio-segmented-control"
        >
          <button
            type="button"
            aria-pressed={mode === "generate"}
            onClick={() => setMode("generate")}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors duration-150 ${
              mode === "generate" ? "bg-primary text-bg" : "text-muted hover:text-ink"
            }`}
          >
            Сгенерировать
          </button>
          <button
            type="button"
            aria-pressed={mode === "edit"}
            onClick={() => setMode("edit")}
            className={`rounded px-3 py-1 text-xs font-medium transition-colors duration-150 ${
              mode === "edit" ? "bg-primary text-bg" : "text-muted hover:text-ink"
            }`}
          >
            Редактировать фото
          </button>
        </div>

        {mode === "edit" ? (
          <div className="flex flex-col gap-3">
            <input
              type="file"
              accept="image/*"
              aria-label="Исходное фото"
              onChange={(event) => setEditFile(event.target.files?.[0] ?? null)}
              className="text-sm text-muted"
            />
            <div data-testid="images-edit-row" className="studio-action-row">
              <textarea
                value={editPrompt}
                onChange={(event) => setEditPrompt(event.target.value)}
                placeholder='Опишите правку — например, "сделай фон синим"…'
                aria-label="Промпт для редактирования"
                rows={2}
                maxLength={4000}
                className="input min-w-0 flex-1 resize-none"
              />
              <button
                type="button"
                onClick={() => void submitEdit()}
                disabled={editSubmitting || !editPrompt.trim() || !editFile}
                className="btn-primary h-fit"
              >
                {editSubmitting ? "Редактируем…" : "Редактировать"}
              </button>
            </div>
            {editSubmitError && (
              <p role="alert" className="text-sm text-danger">
                {editSubmitError}
              </p>
            )}
          </div>
        ) : (
          <>
        <OptionPicker
          ariaLabel="Тип картинки"
          options={TASKS}
          selected={task}
          onSelect={(value) => setTask(value as ImageTask)}
          className="studio-option-grid"
        />

        <div data-testid="images-prompt-row" className="studio-action-row">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Опишите изображение, которое хотите создать…"
            aria-label="Промпт для картинки"
            rows={2}
            maxLength={4000}
            className="input min-w-0 flex-1 resize-none"
          />
          <button
            type="button"
            onClick={() => void generate()}
            disabled={submitting || !prompt.trim()}
            className="btn-primary h-fit"
          >
            {submitting ? "Генерируем…" : "Сгенерировать"}
          </button>
        </div>

        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {submitError}
          </p>
        )}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-6 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && loading && <p role="status" className="mt-10 text-sm text-muted">Загрузка…</p>}

      {!error && !loading && data && data.results.length === 0 && (
        <p className="mt-10 text-sm text-muted">Пока нет визуалов — сгенерируйте один выше.</p>
      )}

      {!error && data && data.results.length > 0 && (
        <div
          className="mt-8 grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))" }}
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
    </div>
  );
}

function ImageCard({ entry }: { entry: GeneratedImageEntry }) {
  const inProgress = IN_PROGRESS.has(entry.status);
  return (
    <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface">
      <div className="flex aspect-square items-center justify-center bg-bg">
        {entry.image_url ? (
          <ImageLightbox
            src={entry.image_url}
            alt={entry.prompt}
            downloadName={`lumenza-image-${entry.id}`}
          />
        ) : inProgress ? (
          <span className="text-xs text-muted" aria-live="polite">
            Генерируем…
          </span>
        ) : (
          <span className="text-xs text-muted">Нет картинки</span>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        {entry.source_image_url && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.source_image_url}
              alt="Исходное фото"
              className="h-8 w-8 rounded object-cover"
            />
            <span className="text-[11px] text-muted">Отредактированное фото</span>
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
    </div>
  );
}
