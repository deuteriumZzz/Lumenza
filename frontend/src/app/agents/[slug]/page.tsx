"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AgentRunResult } from "@/components/agent-run-result";
import { ResearchDigestResult } from "@/components/research-digest-result";
import { DocumentSummaryResult } from "@/components/document-summary-result";
import { FileUploadButton } from "@/components/file-upload-button";
import { WorkspacePicker } from "@/components/workspace-picker";
import { useAuth } from "@/lib/auth-context";
import { usePolledStatus } from "@/lib/use-polled-status";
import {
  api,
  apiErrorMessage,
  ApiError,
  type AgentDetail,
  type AgentRun,
  type DocumentExtractionEntry,
  type ThreadsContentPlan,
  type ResearchDigestResult as ResearchDigestResultData,
  type DocumentSummaryResult as DocumentSummaryResultData,
  type TelegramChannelEntry,
  type Workspace,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";

// Mirrors automations.services.default_publish_text on the backend — the
// same fallback used when a *scheduled* run has no user present to fill a
// draft in. Here it's only the starting point for an editable textarea the
// user reviews before creating the PendingAction, so it doesn't need to be
// exhaustive — just a reasonable default per agent result shape.
function defaultPublishText(slug: string, result: AgentRun["result"]): string {
  if (!result) return "";
  if (
    (slug === "research-digest" || slug === "document-summary") &&
    "summary" in result &&
    result.summary
  ) {
    return result.summary;
  }
  if (slug === "threads-content-day" && "schedule" in result) {
    return result.schedule.map((item) => item.post_text).filter(Boolean).join("\n\n");
  }
  return JSON.stringify(result);
}

const POLL_INTERVAL_MS = 2000;
const IN_PROGRESS = new Set<AgentRun["status"]>(["pending", "processing"]);
const TERMINAL_ERROR = new Set<AgentRun["status"]>([
  "error",
  "insufficient_credits",
  "blocked",
]);
const DOCUMENT_IN_PROGRESS = new Set<DocumentExtractionEntry["status"]>([
  "pending",
  "processing",
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
  const [attachedWorkspace, setAttachedWorkspace] = useState<Workspace | null>(null);
  const [preferredModel, setPreferredModel] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const [channels, setChannels] = useState<TelegramChannelEntry[] | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishChannelId, setPublishChannelId] = useState<number | null>(null);
  const [publishText, setPublishText] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState(false);

  // At most one "document_upload" field exists per agent today (see
  // document-summary's input_schema) — a single slot is enough; this
  // would need to become a per-field map if a future agent ever needs two.
  const documentFieldKeyRef = useRef<string | null>(null);
  const [documentExtraction, setDocumentExtraction] = useState<DocumentExtractionEntry | null>(
    null
  );
  const [documentError, setDocumentError] = useState<string | null>(null);

  // A custom "Мои агенты" agent's result shape matches its LAST chosen
  // source agent's output_schema (see agents.services.create_custom_agent),
  // not its own generated slug — so the per-slug renderer/publish-text
  // dispatch below resolves on this instead of the raw route param.
  const resultSourceSlug = agent?.source_agent_slugs?.length
    ? agent.source_agent_slugs[agent.source_agent_slugs.length - 1]
    : params.slug;

  useEffect(() => {
    let cancelled = false;
    api.agent(params.slug).then(
      (data) => {
        if (cancelled) return;
        setAgent(data);
        const draftKey = `lumenza:agent-draft:${params.slug}`;
        const modelKey = `lumenza:agent-model:${params.slug}`;
        let requestedPrompt = "";
        try {
          requestedPrompt = sessionStorage.getItem(draftKey)?.trim() ?? "";
          sessionStorage.removeItem(draftKey);
          setPreferredModel(sessionStorage.getItem(modelKey));
          sessionStorage.removeItem(modelKey);
        } catch {
          // Continue with an empty form when browser privacy settings block storage.
        }
        setInput((prev) => {
          const next = { ...prev };
          for (const field of data.input_schema.fields) {
            if (!(field.key in next)) next[field.key] = field.options?.[0] ?? "";
          }
          const promptField = data.input_schema.fields.find(
            (field) => field.type !== "select" && field.type !== "document_upload",
          );
          if (requestedPrompt && promptField && !next[promptField.key]) {
            next[promptField.key] = requestedPrompt;
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

  async function uploadDocument(fieldKey: string, file: File) {
    documentFieldKeyRef.current = fieldKey;
    setDocumentError(null);
    try {
      const created = await api.createDocumentExtraction(file);
      setDocumentExtraction(created);
    } catch (err) {
      setDocumentError(apiErrorMessage(err, "Не удалось загрузить документ."));
    }
  }

  usePolledStatus(
    documentExtraction,
    DOCUMENT_IN_PROGRESS,
    api.documentExtraction,
    (updated) => {
      setDocumentExtraction(updated);
      const fieldKey = documentFieldKeyRef.current;
      if (updated.status === "ok" && fieldKey) {
        setInput((prev) => ({ ...prev, [fieldKey]: updated.text }));
      }
    },
    () => setDocumentError("Потеряна связь при проверке статуса — обновите страницу.")
  );

  async function submit() {
    if (!agent || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const args = [
        agent.slug,
        input,
        idempotencyKeyRef.current,
        attachedWorkspace?.id ?? null,
      ] as const;
      const created = preferredModel
        ? await api.createAgentRun(...args, preferredModel)
        : await api.createAgentRun(...args);
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
    setPublishOpen(false);
    setPublishedAt(false);
  }

  function openPublishForm() {
    if (run?.result) setPublishText(defaultPublishText(resultSourceSlug, run.result));
    setPublishError(null);
    setPublishOpen(true);
    if (channels === null) {
      api.telegramChannels().then(setChannels, () =>
        setPublishError("Не удалось загрузить каналы Telegram.")
      );
    }
  }

  async function submitPublish() {
    if (!run || !publishChannelId || !publishText.trim() || publishing) return;
    setPublishing(true);
    setPublishError(null);
    try {
      await api.requestPublish(run.id, publishChannelId, publishText.trim());
      setPublishOpen(false);
      setPublishedAt(true);
    } catch (err) {
      setPublishError(apiErrorMessage(err, "Не удалось создать черновик публикации."));
    } finally {
      setPublishing(false);
    }
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
    <div className="agent-run-workspace mx-auto w-full max-w-5xl flex-1 px-3 py-7 min-[380px]:px-4 sm:px-6 sm:py-10">
      <header className="agent-run-header">
        <Link href="/agents" className="agent-back-link">← Все агенты</Link>
        <span className="agent-active-domain">Активная область: {agent.category}</span>
        <h1>{agent.name}</h1>
        <p>{agent.description}</p>
      </header>

      {!run && (
        <div className="agent-run-composer mt-6 flex flex-col gap-4">
          {agent.input_schema.fields.map((field) => (
            <label key={field.key} className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">{field.label}</span>
              {field.type === "document_upload" ? (
                <div className="flex flex-col gap-2">
                  <FileUploadButton
                    accept="image/*,.pdf"
                    label={
                      documentExtraction && DOCUMENT_IN_PROGRESS.has(documentExtraction.status)
                        ? "Обрабатываем…"
                        : "Загрузить документ"
                    }
                    onFile={(file) => void uploadDocument(field.key, file)}
                    disabled={Boolean(
                      documentExtraction && DOCUMENT_IN_PROGRESS.has(documentExtraction.status)
                    )}
                    className="btn-secondary self-start"
                  />
                  {documentError && (
                    <p role="alert" className="text-xs text-danger">
                      {documentError}
                    </p>
                  )}
                  {documentExtraction?.status === "ok" && (
                    <p className="text-xs text-muted">
                      Текст извлечён ({documentExtraction.text.length} симв.)
                    </p>
                  )}
                  {documentExtraction?.status === "error" && (
                    <p className="text-xs text-danger">
                      Не удалось распознать документ — попробуйте ещё раз.
                    </p>
                  )}
                </div>
              ) : field.type === "select" ? (
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

          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">База знаний (необязательно)</span>
            <WorkspacePicker
              selectedWorkspaceId={attachedWorkspace?.id ?? null}
              onSelect={setAttachedWorkspace}
            />
          </div>

          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !requiredFilled}
            className="btn-primary self-end"
          >
            {submitting ? "Запускаем…" : "Запустить"}
          </button>
        </div>
      )}

      {run && (
        <div className="agent-run-transcript mt-6 flex flex-col gap-6">
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

          {run.status === "ok" &&
            run.result &&
            (resultSourceSlug === "research-digest" ? (
              <ResearchDigestResult data={run.result as ResearchDigestResultData} />
            ) : resultSourceSlug === "document-summary" ? (
              <DocumentSummaryResult data={run.result as DocumentSummaryResultData} />
            ) : (
              <AgentRunResult plan={run.result as ThreadsContentPlan} />
            ))}

          {run.status === "ok" && run.result && (
            <div className="rounded-md border border-border bg-surface p-4">
              {publishedAt ? (
                <p className="text-sm text-ink">
                  Черновик создан.{" "}
                  <Link href="/automations" className="font-medium underline">
                    Подтвердить публикацию
                  </Link>
                </p>
              ) : !publishOpen ? (
                <button type="button" onClick={openPublishForm} className="btn-secondary">
                  Опубликовать в Telegram
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted">Канал</span>
                    {channels === null ? (
                      <p role="status" className="text-sm text-muted">
                        Загрузка каналов…
                      </p>
                    ) : channels.length === 0 ? (
                      <p className="text-sm text-muted">
                        Нет подключённых каналов —{" "}
                        <Link href="/automations" className="underline">
                          подключите канал
                        </Link>
                        .
                      </p>
                    ) : (
                      <select
                        value={publishChannelId ?? ""}
                        onChange={(event) =>
                          setPublishChannelId(Number(event.target.value) || null)
                        }
                        className="input"
                      >
                        <option value="">Выберите канал</option>
                        {channels.map((channel) => (
                          <option key={channel.id} value={channel.id}>
                            {channel.title}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>

                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted">Текст поста (можно отредактировать)</span>
                    <textarea
                      value={publishText}
                      onChange={(event) => setPublishText(event.target.value)}
                      rows={6}
                      maxLength={8000}
                      className="input"
                    />
                  </label>

                  {publishError && (
                    <p role="alert" className="text-sm text-danger">
                      {publishError}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void submitPublish()}
                      disabled={publishing || !publishChannelId || !publishText.trim()}
                      className="btn-primary"
                    >
                      {publishing ? "Создаём…" : "Создать черновик"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPublishOpen(false)}
                      className="btn-secondary"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
