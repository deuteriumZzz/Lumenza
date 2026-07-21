"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type PhotoAnalysisEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Lost connection while checking status — please refresh the page.";

export default function AnalyzePage() {
  return (
    <RequireAuth>
      <Analyze />
    </RequireAuth>
  );
}

function Analyze() {
  const { refreshBalance } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<PhotoAnalysisEntry | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      setPreview(URL.createObjectURL(file));
      void submitPhoto(file);
    }
    event.target.value = "";
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
        setError("Not enough credits for this request.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Photo analysis isn't unlocked on your plan yet.");
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
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Analyze</h1>
      <p className="mt-1 text-sm text-muted">
        Upload a photo and get a caption idea for it — describes the content, not literal text in the image
        (for that, use Documents).
      </p>

      <div className="mt-6 rounded-md border border-border bg-surface p-4">
        <label className="btn-primary inline-block cursor-pointer">
          {submitting ? "Uploading…" : "Upload photo"}
          <input type="file" accept="image/*" onChange={onFileChosen} disabled={submitting} className="hidden" />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {entry && (
        <div className="mt-4 flex gap-4 rounded-md border border-border bg-surface p-4">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Uploaded photo" className="h-24 w-24 flex-shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className={`status-pill ${statusPillClass(entry.status)}`}>
                {entry.status}
              </span>
              {entry.mocked && <span className="status-pill bg-surface-raised">mock</span>}
            </div>
            {entry.status === "ok" && <p className="mt-2 whitespace-pre-wrap text-sm text-ink">{entry.text}</p>}
            {entry.status === "error" && (
              <p className="mt-2 text-sm text-danger">
                Something went wrong processing this — credits were refunded. Please try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
