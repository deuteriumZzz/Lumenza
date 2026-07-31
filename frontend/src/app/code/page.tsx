"use client";

import { useState } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, apiErrorMessage, ApiError, type CodeExecutionEntry } from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";

const IN_PROGRESS = new Set(["pending", "processing"]);
const STALLED_MESSAGE = "Потеряна связь при проверке статуса — обновите страницу.";
const MAX_CODE_LENGTH = 20000;

// /code теперь режим внутри творческой студии (/studio).
export default function CodePage() {
  redirect("/studio");
}

export function Code() {
  const { refreshBalance } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<CodeExecutionEntry | null>(null);

  async function submitCode() {
    const trimmed = code.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const created = await api.createCodeExecution(trimmed);
      setEntry(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setError("Недостаточно кредитов для этого запроса.");
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
    api.codeExecution,
    (updated) => {
      setEntry(updated);
      if (!IN_PROGRESS.has(updated.status)) void refreshBalance();
    },
    () => setError(STALLED_MESSAGE)
  );

  return (
    <div className="studio-content mx-auto w-full max-w-3xl flex-1 px-3 py-6 min-[380px]:px-4 sm:px-6 sm:py-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Код</h1>
      <p className="mt-1 text-sm text-muted">
        Запустите короткий Python-скрипт в изолированной песочнице — вывод stdout/stderr и код
        завершения, без файлов и графиков.
      </p>

      <div className="mt-6 rounded-md border border-border bg-surface p-3 sm:p-4">
        <label htmlFor="code-interpreter-input" className="sr-only">
          Python-код
        </label>
        <textarea
          id="code-interpreter-input"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          maxLength={MAX_CODE_LENGTH}
          rows={10}
          spellCheck={false}
          placeholder={'print("hello")'}
          className="input w-full font-mono text-sm"
        />
        <button
          type="button"
          onClick={() => void submitCode()}
          disabled={submitting || !code.trim()}
          className="btn-primary mt-3"
        >
          {submitting ? "Выполняем…" : "Выполнить"}
        </button>

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      {entry && (
        <div className="mt-4 rounded-md border border-border bg-surface p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span role="status" className={`status-pill ${statusPillClass(entry.status)}`}>
              {entry.status}
            </span>
            {entry.status === "ok" && <span>код завершения: {entry.exit_code}</span>}
            {entry.mocked && <span className="status-pill bg-surface-raised">мок</span>}
          </div>

          {entry.status === "ok" && (
            <div className="mt-3 flex flex-col gap-3">
              {entry.stdout && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-bg p-3 text-sm text-ink">
                  {entry.stdout}
                </pre>
              )}
              {entry.stderr && (
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-bg p-3 text-sm text-danger">
                  {entry.stderr}
                </pre>
              )}
              {!entry.stdout && !entry.stderr && (
                <p className="text-sm text-muted">Скрипт выполнился без вывода.</p>
              )}
            </div>
          )}
          {entry.status === "blocked" && (
            <p className="mt-2 text-sm text-danger">
              Этот код заблокирован модерацией — кредиты возвращены.
            </p>
          )}
          {entry.status === "error" && (
            <p className="mt-2 text-sm text-danger">
              Что-то пошло не так при выполнении — кредиты возвращены. Попробуйте ещё раз.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
