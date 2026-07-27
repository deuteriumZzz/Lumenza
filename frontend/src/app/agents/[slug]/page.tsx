"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AgentRunResult } from "@/components/agent-run-result";
import { useAuth } from "@/lib/auth-context";
import {
  api,
  apiErrorMessage,
  ApiError,
  type AgentDetail,
  type AgentRun,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";

const POLL_INTERVAL_MS = 2000;
const IN_PROGRESS = new Set<AgentRun["status"]>(["pending", "processing"]);
const TERMINAL_ERROR = new Set<AgentRun["status"]>([
  "error",
  "insufficient_credits",
  "blocked",
]);

export default function AgentRunPage() {
  const params = useParams<{ slug: string }>();
  const { refreshBalance } = useAuth();

  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    let cancelled = false;
    api.agent(params.slug).then(
      (data) => {
        if (cancelled) return;
        setAgent(data);
        setInput((prev) => {
          const next = { ...prev };
          for (const field of data.input_schema.fields) {
            if (!(field.key in next)) next[field.key] = field.options?.[0] ?? "";
          }
          return next;
        });
      },
      (err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, "Не удалось загрузить агента."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  useEffect(() => {
    if (!run || !IN_PROGRESS.has(run.status)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      api.agentRun(run.id).then((updated) => {
        if (cancelled) return;
        setRun(updated);
        if (!IN_PROGRESS.has(updated.status)) void refreshBalance();
      });
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [run, refreshBalance]);

  async function submit() {
    if (!agent || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const created = await api.createAgentRun(agent.slug, input, idempotencyKeyRef.current);
      setRun(created);
      void refreshBalance();
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setSubmitError("Недостаточно кредитов для запуска агента.");
      } else {
        setSubmitError(apiErrorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    idempotencyKeyRef.current = crypto.randomUUID();
    setRun(null);
    setSubmitError(null);
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-8 sm:px-6 sm:py-12">
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-8 sm:px-6 sm:py-12">
        <p role="status" className="text-sm text-muted">
          Загрузка…
        </p>
      </div>
    );
  }

  const requiredFilled = agent.input_schema.fields.every(
    (field) => !field.required || (input[field.key] ?? "").trim().length > 0
  );

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-3 py-8 min-[380px]:px-4 sm:px-6 sm:py-12">
      <h1 className="text-xl font-semibold tracking-tight text-ink">{agent.name}</h1>
      <p className="mt-1 text-sm text-muted">{agent.description}</p>

      {!run && (
        <div className="mt-6 flex flex-col gap-4 rounded-md border border-border bg-surface p-4">
          {agent.input_schema.fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">{field.label}</span>
              {field.type === "select" ? (
                <select
                  value={input[field.key] ?? ""}
                  onChange={(event) =>
                    setInput((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="input"
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={input[field.key] ?? ""}
                  maxLength={field.max_length}
                  onChange={(event) =>
                    setInput((prev) => ({ ...prev, [field.key]: event.target.value }))
                  }
                  className="input"
                />
              )}
            </label>
          ))}

          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !requiredFilled}
            className="btn-primary self-start"
          >
            {submitting ? "Запускаем…" : "Запустить"}
          </button>
        </div>
      )}

      {run && (
        <div className="mt-6 flex flex-col gap-6">
          <ol className="flex flex-col gap-2">
            {run.steps.map((step) => (
              <li
                key={step.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="text-ink">{step.label}</span>
                <span className={`status-pill ${statusPillClass(step.status)}`} aria-live="polite">
                  {step.status}
                </span>
              </li>
            ))}
          </ol>

          {TERMINAL_ERROR.has(run.status) && (
            <p role="alert" className="text-sm text-danger">
              {run.error_message || "Не удалось выполнить агента."}
            </p>
          )}

          {run.status === "ok" && run.result && <AgentRunResult plan={run.result} />}

          {!IN_PROGRESS.has(run.status) && (
            <button type="button" onClick={startOver} className="btn-secondary self-start">
              Запустить снова
            </button>
          )}
        </div>
      )}
    </div>
  );
}
