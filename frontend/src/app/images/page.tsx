"use client";

import { useEffect, useRef, useState } from "react";
import { redirect, usePathname, useRouter, useSearchParams } from "next/navigation";
import { ImageLightbox } from "@/components/image-lightbox";
import { StudioPromptDock } from "@/components/studio-prompt-dock";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  apiErrorMessage,
  ApiError,
  type GeneratedImageEntry,
  type ImageTask,
  type Paginated,
  type UpscaleTask,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";

const MODEL_BY_TASK: Record<ImageTask, string> = {
  illustration: "FLUX Schnell",
  realistic: "DALL·E 3",
  premium: "FLUX.1 Dev",
};

const TASK_BY_MODEL = Object.fromEntries(
  Object.entries(MODEL_BY_TASK).map(([task, model]) => [model, task]),
) as Record<string, ImageTask>;

// Те же 4 строки, что и у карточек режима Upscale в studio/page.tsx и у
// MODEL_OPTIONS.upscale в studio-workspace-controls.tsx — единственный
// реально работающий пикер варианта апскейла (через selectedModel/
// onModelChange, тот же механизм, что уже реально маршрутизирует Image
// mode выше), поэтому именование должно совпадать в трёх местах.
const UPSCALE_LABELS: Record<UpscaleTask, string> = {
  upscale_2x: "2× clarity",
  upscale_4x: "4× detail",
  upscale_2x_face: "Face recovery",
  upscale_4x_face: "Texture preserve",
};

const TASK_BY_UPSCALE_LABEL = Object.fromEntries(
  Object.entries(UPSCALE_LABELS).map(([task, label]) => [label, task]),
) as Record<string, UpscaleTask>;

const IN_PROGRESS = new Set<GeneratedImageEntry["status"]>(["pending", "processing"]);
const POLL_INTERVAL_MS = 2000;

// /images теперь режим внутри творческой студии (/studio) — старая прямая
// ссылка остаётся рабочей, просто ведёт туда же.
export default function ImagesPage() {
  redirect("/studio");
}

export function Images({
  initialMode = "generate",
  initialPrompt = "",
}: {
  initialMode?: "generate" | "edit" | "upscale";
  initialPrompt?: string;
}) {
  const { refreshBalance } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [page, setPageState] = useState(() => {
    const raw = Number(searchParams.get("page"));
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 1;
  });
  // Тот же паттерн пометки страницы, что и на странице history: `loading`
  // выводится, а не отслеживается как отдельный флаг, для которого
  // понадобился бы синхронный setState в начале эффекта загрузки ниже.
  const [result, setResult] = useState<{ page: number; data: Paginated<GeneratedImageEntry> } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Отражает страницу галереи в query-параметре `page` (тот же приём прямого
  // router.replace в обработчике, что и в studio/page.tsx/history/page.tsx),
  // чтобы навигация назад/вперёд и ссылка восстанавливали ту же страницу.
  // Компонент встраивается только внутри /studio (см. StudioModePanel), уже
  // обёрнутого в Suspense, поэтому отдельная граница здесь не нужна.
  function updatePage(next: number) {
    setPageState(next);
    const query = new URLSearchParams(searchParams.toString());
    if (next > 1) query.set("page", String(next));
    else query.delete("page");
    const queryString = query.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }

  const mode = initialMode;
  const [prompt, setPrompt] = useState(initialPrompt);
  const [task, setTask] = useState<ImageTask>("illustration");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editSubmitError, setEditSubmitError] = useState<string | null>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [upscaleTask, setUpscaleTask] = useState<UpscaleTask>("upscale_2x");
  // Апскейл не принимает промпт на бэкенде (start_image_upscale сам
  // синтезирует подпись) — это поле чисто декоративное, никогда не
  // отправляется, но StudioPromptDock блокирует "Создать" при пустой
  // строке, так что держим его синхронизированным с выбранным вариантом.
  const [upscalePrompt, setUpscalePrompt] = useState(UPSCALE_LABELS.upscale_2x);
  const [upscaleFile, setUpscaleFile] = useState<File | null>(null);
  const [upscaleSubmitting, setUpscaleSubmitting] = useState(false);
  const [upscaleSubmitError, setUpscaleSubmitError] = useState<string | null>(null);
  const upscaleFileInputRef = useRef<HTMLInputElement>(null);

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
        updatePage(1);
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
        updatePage(1);
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

  async function submitUpscale() {
    if (!upscaleFile || upscaleSubmitting) return;
    setUpscaleSubmitError(null);
    setUpscaleSubmitting(true);
    try {
      const created = await api.createImageUpscale(upscaleFile, upscaleTask);
      setUpscaleFile(null);
      void refreshBalance();
      if (page === 1) {
        setResult((prev) =>
          prev
            ? { ...prev, data: { ...prev.data, count: prev.data.count + 1, results: [created, ...prev.data.results] } }
            : prev
        );
      } else {
        updatePage(1);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setUpscaleSubmitError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setUpscaleSubmitError(apiErrorMessage(err));
      } else {
        setUpscaleSubmitError(apiErrorMessage(err));
      }
    } finally {
      setUpscaleSubmitting(false);
    }
  }

  return (
    <div
      data-testid="images-content"
      className="studio-content studio-image-workspace mx-auto w-full max-w-[92rem] flex-1 px-3 pb-44 pt-2 min-[380px]:px-4 sm:px-8 lg:px-10"
    >
      <div className="studio-gallery-heading">
        <div>
          <p className="studio-kicker">{mode === "edit" ? "Transform" : mode === "upscale" ? "Enhance" : "Inspirations"}</p>
          <h2>{mode === "edit" ? "Edit mode" : mode === "upscale" ? "Upscale mode" : "Your visual workspace"}</h2>
          <p>
            {mode === "edit"
              ? "Добавьте исходник и опишите точную правку."
              : mode === "upscale"
                ? "Загрузите изображение и выберите вариант увеличения."
                : "Создавайте визуалы внизу — новые результаты появляются здесь."}
          </p>
        </div>
        <span>{data?.count ?? 0} creations</span>
      </div>

      {mode === "edit" && (
        <input
          ref={editFileInputRef}
          type="file"
          accept="image/*"
          aria-label="Исходное фото"
          onChange={(event) => setEditFile(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
      )}

      {mode === "upscale" && (
        <input
          ref={upscaleFileInputRef}
          type="file"
          accept="image/*"
          aria-label="Изображение для увеличения"
          onChange={(event) => setUpscaleFile(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
      )}

      {error && (
        <p role="alert" className="studio-gallery-notice text-danger">
          {error}
        </p>
      )}

      {!error && loading && <p role="status" className="studio-gallery-notice">Загрузка…</p>}

      {!error && !loading && data && data.results.length === 0 && (
        mode === "edit" ? (
          <button
            type="button"
            aria-label="Загрузить исходное изображение"
            onClick={() => editFileInputRef.current?.click()}
            className="studio-gallery-empty studio-gallery-upload"
          >
            <span aria-hidden="true">＋</span>
            <h3>Загрузите первый исходник</h3>
            <p>PNG, JPG или WEBP · затем опишите правку в нижней панели.</p>
          </button>
        ) : mode === "upscale" ? (
          <button
            type="button"
            aria-label="Загрузить изображение для увеличения"
            onClick={() => upscaleFileInputRef.current?.click()}
            className="studio-gallery-empty studio-gallery-upload"
          >
            <span aria-hidden="true">＋</span>
            <h3>Загрузите первое изображение</h3>
            <p>PNG, JPG или WEBP · затем выберите вариант ниже.</p>
          </button>
        ) : (
          <div className="studio-gallery-empty">
            <span aria-hidden="true">✦</span>
            <h3>Здесь появится ваша первая серия</h3>
            <p>Выберите модель, опишите идею и нажмите «Создать».</p>
          </div>
        )
      )}

      {!error && data && data.results.length > 0 && (
        <div className="studio-generation-grid">
          {data.results.map((entry) => (
            <ImageCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {data && (data.next || data.previous) && (
        <div className="studio-gallery-pagination">
          <button
            type="button"
            disabled={!data.previous}
            onClick={() => updatePage(Math.max(1, page - 1))}
            className="btn-secondary disabled:opacity-40"
          >
            Назад
          </button>
          <button
            type="button"
            disabled={!data.next}
            onClick={() => updatePage(page + 1)}
            className="btn-secondary disabled:opacity-40"
          >
            Далее
          </button>
        </div>
      )}

      <StudioPromptDock
        mode={mode === "edit" ? "edit" : mode === "upscale" ? "upscale" : "image"}
        prompt={mode === "edit" ? editPrompt : mode === "upscale" ? upscalePrompt : prompt}
        onPromptChange={mode === "edit" ? setEditPrompt : mode === "upscale" ? setUpscalePrompt : setPrompt}
        onSubmit={() =>
          void (mode === "edit" ? submitEdit() : mode === "upscale" ? submitUpscale() : generate())
        }
        onAddReference={
          mode === "edit"
            ? () => editFileInputRef.current?.click()
            : mode === "upscale"
              ? () => upscaleFileInputRef.current?.click()
              : undefined
        }
        submitDisabled={(mode === "edit" && !editFile) || (mode === "upscale" && !upscaleFile)}
        busy={mode === "edit" ? editSubmitting : mode === "upscale" ? upscaleSubmitting : submitting}
        selectedModel={
          mode === "edit"
            ? "FLUX.1 Kontext"
            : mode === "upscale"
              ? UPSCALE_LABELS[upscaleTask]
              : MODEL_BY_TASK[task]
        }
        onModelChange={
          mode === "edit"
            ? undefined
            : mode === "upscale"
              ? (label) => {
                  const nextTask = TASK_BY_UPSCALE_LABEL[label];
                  if (nextTask) {
                    setUpscaleTask(nextTask);
                    setUpscalePrompt(UPSCALE_LABELS[nextTask]);
                  }
                }
              : (model) => {
                  const nextTask = TASK_BY_MODEL[model];
                  if (nextTask) setTask(nextTask);
                }
        }
        referenceLabel={mode === "edit" ? editFile?.name : mode === "upscale" ? upscaleFile?.name : undefined}
        status={
          mode === "edit"
            ? editSubmitError ?? undefined
            : mode === "upscale"
              ? upscaleSubmitError ?? undefined
              : submitError ?? undefined
        }
      />
    </div>
  );
}

function ImageCard({ entry }: { entry: GeneratedImageEntry }) {
  const inProgress = IN_PROGRESS.has(entry.status);
  return (
    <article className="studio-generation-card group">
      <div className="studio-generation-media">
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
      <div className="studio-generation-meta">
        {entry.source_image_url && (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={entry.source_image_url}
              alt="Исходное фото"
              width={32}
              height={32}
              className="h-8 w-8 rounded object-cover"
            />
            <span className="text-[11px] text-muted">Исходное фото</span>
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
