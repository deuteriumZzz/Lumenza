"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type DocumentExtractionEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Lost connection while checking status — please refresh the page.";

export default function DocumentsPage() {
  return (
    <RequireAuth>
      <Documents />
    </RequireAuth>
  );
}

function Documents() {
  const { refreshBalance } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<DocumentExtractionEntry | null>(null);

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void submitDocument(file);
    event.target.value = "";
  }

  async function submitDocument(file: File) {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createDocumentExtraction(file);
      setEntry(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Not enough credits for this request.");
      } else if (err instanceof ApiError && err.status === 403) {
        setError("Document extraction isn't unlocked on your plan yet.");
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
      <h1 className="text-xl font-semibold tracking-tight text-ink">Documents</h1>
      <p className="mt-1 text-sm text-muted">
        Extract text from a screenshot, image, or scanned document — useful for repurposing a competitor&apos;s post.
      </p>

      <div className="mt-6 rounded-md border border-border bg-surface p-4">
        <label className="btn-primary inline-block cursor-pointer">
          {submitting ? "Uploading…" : "Upload image or PDF"}
          <input type="file" accept="image/*,.pdf" onChange={onFileChosen} disabled={submitting} className="hidden" />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {entry && (
        <div className="mt-4 rounded-md border border-border bg-surface p-4">
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
      )}
    </div>
  );
}
