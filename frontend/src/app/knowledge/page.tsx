"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { FileUploadButton } from "@/components/file-upload-button";
import { usePolledStatus } from "@/lib/use-polled-status";
import { statusPillClass } from "@/lib/status-styles";
import {
  api,
  apiErrorMessage,
  ApiError,
  type ChunkMatch,
  type KnowledgeSource,
  type Workspace,
} from "@/lib/api";

const SOURCE_IN_PROGRESS = new Set(["pending", "processing"]);

export default function KnowledgePage() {
  return (
    <RequireAuth>
      <Knowledge />
    </RequireAuth>
  );
}

function Knowledge() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.workspaces().then(
      (data) => {
        if (cancelled) return;
        setWorkspaces(data);
        if (data.length > 0) setActiveId((prev) => prev ?? data[0].id);
      },
      (err) => {
        if (!cancelled) {
          setError(apiErrorMessage(err, "Не удалось загрузить рабочие пространства."));
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  async function createWorkspace() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createWorkspace(name);
      setWorkspaces((prev) => [created, ...(prev ?? [])]);
      setActiveId(created.id);
      setNewName("");
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось создать рабочее пространство."));
    } finally {
      setCreating(false);
    }
  }

  async function deleteWorkspace(id: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await api.deleteWorkspace(id);
      setWorkspaces((prev) => prev?.filter((workspace) => workspace.id !== id) ?? prev);
      setActiveId((prev) => (prev === id ? null : prev));
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось удалить рабочее пространство."));
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-8 min-[380px]:px-4 sm:px-6 sm:py-12">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Знания</h1>
      <p className="mt-1 text-sm text-muted">
        Личные источники знаний — вставьте текст или загрузите изображение, чтобы находить
        его по смыслу.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {workspaces === null && (
          <p role="status" className="text-sm text-muted">
            Загрузка…
          </p>
        )}
        {workspaces?.map((workspace) => (
          <div key={workspace.id} className="group relative">
            <button
              type="button"
              aria-pressed={activeId === workspace.id}
              onClick={() => setActiveId(workspace.id)}
              className={`rounded-full border px-3.5 py-1.5 pr-7 text-sm transition-colors duration-150 ${
                activeId === workspace.id
                  ? "border-primary/50 text-ink"
                  : "border-border bg-surface/75 text-muted hover:border-primary/25 hover:text-ink"
              }`}
            >
              {workspace.name}
            </button>
            <button
              type="button"
              aria-label={`Удалить «${workspace.name}»`}
              onClick={(event) => void deleteWorkspace(workspace.id, event)}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8m0-8-8 8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Новое рабочее пространство"
          maxLength={120}
          className="input max-w-xs"
        />
        <button
          type="button"
          onClick={() => void createWorkspace()}
          disabled={creating || !newName.trim()}
          className="btn-secondary"
        >
          {creating ? "Создаём…" : "Создать"}
        </button>
      </div>

      {activeId && <WorkspaceDetail workspaceId={activeId} />}
    </div>
  );
}

function WorkspaceDetail({ workspaceId }: { workspaceId: number }) {
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [submittingText, setSubmittingText] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ChunkMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Сброс во время рендера при смене workspaceId (не внутри эффекта) — тот
  // же паттерн, что и в chat-thread-view.tsx для смены треда: иначе на миг
  // видны источники/результаты предыдущего workspace, пока не подгрузятся
  // новые.
  const [prevWorkspaceId, setPrevWorkspaceId] = useState(workspaceId);
  if (workspaceId !== prevWorkspaceId) {
    setPrevWorkspaceId(workspaceId);
    setSources(null);
    setResults(null);
  }

  useEffect(() => {
    let cancelled = false;
    api.workspaceSources(workspaceId).then(
      (data) => {
        if (!cancelled) setSources(data);
      },
      (err) => {
        if (!cancelled) setError(apiErrorMessage(err, "Не удалось загрузить источники."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  function upsertSource(updated: KnowledgeSource) {
    setSources((prev) => {
      if (!prev) return [updated];
      const exists = prev.some((source) => source.id === updated.id);
      return exists
        ? prev.map((source) => (source.id === updated.id ? updated : source))
        : [updated, ...prev];
    });
  }

  function creditsErrorMessage(err: unknown): string {
    return err instanceof ApiError && err.status === 402
      ? "Недостаточно кредитов для добавления источника."
      : apiErrorMessage(err);
  }

  async function submitText() {
    const trimmed = text.trim();
    if (!trimmed || submittingText) return;
    setSubmittingText(true);
    setError(null);
    try {
      const created = await api.addTextSource(workspaceId, trimmed);
      upsertSource(created);
      setText("");
    } catch (err) {
      setError(creditsErrorMessage(err));
    } finally {
      setSubmittingText(false);
    }
  }

  async function submitImage(file: File) {
    setUploadingImage(true);
    setError(null);
    try {
      const created = await api.addImageSource(workspaceId, file);
      upsertSource(created);
    } catch (err) {
      setError(creditsErrorMessage(err));
    } finally {
      setUploadingImage(false);
    }
  }

  async function runSearch() {
    const trimmed = query.trim();
    if (!trimmed || searching) return;
    setSearching(true);
    setSearchError(null);
    try {
      const found = await api.searchWorkspace(workspaceId, trimmed);
      setResults(found);
    } catch (err) {
      setSearchError(apiErrorMessage(err, "Поиск не удался."));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Добавить текст
        </h2>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={4}
          maxLength={20000}
          className="input mt-2 w-full"
          placeholder="Вставьте текст, который нужно проиндексировать"
        />
        <button
          type="button"
          onClick={() => void submitText()}
          disabled={submittingText || !text.trim()}
          className="btn-primary mt-2"
        >
          {submittingText ? "Добавляем…" : "Добавить"}
        </button>
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Добавить изображение
        </h2>
        <div className="mt-2">
          <FileUploadButton
            accept="image/*"
            label={uploadingImage ? "Загружаем…" : "Загрузить изображение"}
            onFile={(file) => void submitImage(file)}
            disabled={uploadingImage}
          />
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Источники</h2>
        {sources === null ? (
          <p role="status" className="mt-3 text-sm text-muted">
            Загрузка…
          </p>
        ) : sources.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Пока нет источников.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {sources.map((source) => (
              <SourceRow key={source.id} source={source} onUpdate={upsertSource} />
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-md border border-border bg-surface p-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Поиск</h2>
        <div className="mt-2 flex gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="О чём спросить это рабочее пространство?"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => void runSearch()}
            disabled={searching || !query.trim()}
            className="btn-secondary"
          >
            {searching ? "Ищем…" : "Найти"}
          </button>
        </div>
        {searchError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {searchError}
          </p>
        )}
        {results &&
          (results.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Ничего не найдено.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {results.map((match) => (
                <li key={match.id} className="rounded-md border border-border bg-bg p-3 text-sm">
                  <p className="text-ink">{match.text}</p>
                  <p className="mt-1 font-mono text-xs text-muted">
                    score {match.score.toFixed(3)}
                  </p>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}

function SourceRow({
  source,
  onUpdate,
}: {
  source: KnowledgeSource;
  onUpdate: (source: KnowledgeSource) => void;
}) {
  // usePolledStatus рассчитан на одну запись — здесь по одному экземпляру
  // хука на строку, каждый опрашивает свой источник независимо; хук сам
  // не делает ничего, пока status не в SOURCE_IN_PROGRESS.
  usePolledStatus(source, SOURCE_IN_PROGRESS, api.sourceStatus, onUpdate, () => undefined);

  return (
    <li className="rounded-md border border-border bg-surface p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink">{source.kind === "image" ? "Изображение" : "Текст"}</span>
        <span className={`status-pill ${statusPillClass(source.status)}`}>{source.status}</span>
      </div>
      {source.status === "ok" && (
        <p className="mt-1 truncate text-xs text-muted">{source.raw_text}</p>
      )}
      {source.status === "error" && (
        <p className="mt-1 text-xs text-danger">
          {source.error_message || "Не удалось обработать источник."}
        </p>
      )}
    </li>
  );
}
