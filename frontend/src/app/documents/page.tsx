"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type DocumentExtractionEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";
import { FileUploadButton } from "@/components/file-upload-button";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Потеряна связь при проверке статуса — обновите страницу.";

// /documents теперь режим внутри единой студии (/chat).
export default function DocumentsPage() {
  redirect("/chat");
}

export function Documents() {
  const { refreshBalance } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<DocumentExtractionEntry | null>(null);

  async function submitDocument(file: File) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createDocumentExtraction(file);
      setEntry(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Недостаточно кредитов для этого запроса.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Извлечение текста из документов ещё не разблокировано на вашем тарифе.");
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
    api.documentExtraction,
    (updated) => {
      setEntry(updated);
      if (!IN_PROGRESS.has(updated.status)) void refreshBalance();
    },
    () => setError(STALLED_MESSAGE)
  );

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Документы</h1>
      <p className="mt-1 text-sm text-muted">
        Извлеките текст из скриншота, картинки или скана документа — удобно для репёрпоза поста конкурента.
      </p>

      <div className="mt-6 rounded-md border border-border bg-surface p-4">
        <FileUploadButton
          accept="image/*,.pdf"
          label={submitting ? "Загружаем…" : "Загрузить картинку или PDF"}
          onFile={(file) => void submitDocument(file)}
          disabled={submitting}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {entry && (
        <div className="mt-4 rounded-md border border-border bg-surface p-4">
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
      )}
    </div>
  );
}
