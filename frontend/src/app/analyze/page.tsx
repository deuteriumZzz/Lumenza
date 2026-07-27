"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type PhotoAnalysisEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";
import { FileUploadButton } from "@/components/file-upload-button";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Потеряна связь при проверке статуса — обновите страницу.";

// /analyze теперь режим внутри творческой студии (/studio).
export default function AnalyzePage() {
  redirect("/studio");
}

export function Analyze() {
  const { refreshBalance } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<PhotoAnalysisEntry | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function onFileChosen(file: File) {
    setPreview(URL.createObjectURL(file));
    void submitPhoto(file);
  }

  async function submitPhoto(file: File) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createPhotoAnalysis(file);
      setEntry(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError(apiErrorMessage(err));
      } else {
        setError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  usePolledStatus(
    entry,
    IN_PROGRESS,
    api.photoAnalysis,
    (updated) => {
      setEntry(updated);
      if (!IN_PROGRESS.has(updated.status)) void refreshBalance();
    },
    () => setError(STALLED_MESSAGE)
  );

  return (
    <div className="studio-content mx-auto w-full max-w-3xl flex-1 px-3 py-6 min-[380px]:px-4 sm:px-6 sm:py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Анализ</h1>
      <p className="mt-1 text-sm text-muted">
        Загрузите фото и получите идею для подписи — описывает содержание, а не буквальный текст на картинке
        (для этого используйте Документы).
      </p>

      <div className="mt-6 rounded-md border border-border bg-surface p-3 sm:p-4">
        <FileUploadButton
          accept="image/*"
          label={submitting ? "Загружаем…" : "Загрузить фото"}
          onFile={onFileChosen}
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {entry && (
        <div className="mt-4 flex flex-col gap-4 rounded-md border border-border bg-surface p-3 sm:flex-row sm:p-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Загруженное фото"
              className="aspect-video w-full flex-shrink-0 rounded object-cover sm:h-24 sm:w-24 sm:aspect-square"
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span role="status" className={`status-pill ${statusPillClass(entry.status)}`}>
                {entry.status}
              </span>
              {entry.mocked && <span className="status-pill bg-surface-raised">мок</span>}
            </div>
            {entry.status === "ok" && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{entry.text}</p>}
            {entry.status === "error" && (
              <p className="mt-2 text-sm text-danger">
                Что-то пошло не так при обработке — кредиты возвращены. Попробуйте ещё раз.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
