"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { redesignMotion } from "@/lib/motion";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FileUploadButton } from "@/components/file-upload-button";
import { RequireAuth } from "@/components/require-auth";
import {
  api,
  apiErrorMessage,
  ApiError,
  type ChunkMatch,
  type EmbedWidgetEntry,
  type KnowledgeSource,
  type Workspace,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";
import { usePolledStatus } from "@/lib/use-polled-status";

const SOURCE_IN_PROGRESS = new Set(["pending", "processing"]);
type SourceFilter = "all" | "text" | "image";
const SOURCE_FILTER_LABELS: Record<SourceFilter, string> = {
  all: "все",
  text: "текст",
  image: "изображения",
};

const SOURCE_STATUS_LABELS: Record<KnowledgeSource["status"], string> = {
  pending: "В очереди",
  processing: "Обработка",
  ok: "Готов",
  error: "Ошибка",
  insufficient_credits: "Недостаточно кредитов",
};

export default function KnowledgePage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Knowledge />
      </Suspense>
    </RequireAuth>
  );
}

function parseSourceFilter(value: string | null): SourceFilter {
  return value === "text" || value === "image" ? value : "all";
}

function Knowledge() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveIdState] = useState<number | null>(() => {
    const raw = Number(searchParams.get("workspace"));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [sourceFilter, setSourceFilterState] = useState<SourceFilter>(() =>
    parseSourceFilter(searchParams.get("filter")),
  );
  const [deleteTarget, setDeleteTarget] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Отражает активное рабочее пространство и фильтр источников в URL
  // (workspace/filter), тот же приём прямого router.replace в обработчике
  // изменения, что и в studio/page.tsx и history/page.tsx — чтобы
  // навигация назад/вперёд, закладки и ссылки восстанавливали тот же вид.
  function syncKnowledgeUrl(nextActiveId: number | null, nextFilter: SourceFilter, clearSource = false) {
    // Сохраняет прочие параметры (например `source`, которым владеет
    // WorkspaceDetail ниже) — переписываются только workspace/filter,
    // если явно не запрошена очистка `source` (при смене пространства).
    const query = new URLSearchParams(searchParams.toString());
    if (nextActiveId !== null) query.set("workspace", String(nextActiveId));
    else query.delete("workspace");
    if (nextFilter !== "all") query.set("filter", nextFilter);
    else query.delete("filter");
    if (clearSource) query.delete("source");
    const queryString = query.toString();
    router.replace(queryString ? `/knowledge?${queryString}` : "/knowledge", { scroll: false });
  }

  function setActiveId(next: number | null) {
    const workspaceChanged = next !== activeId;
    setActiveIdState(next);
    syncKnowledgeUrl(next, sourceFilter, workspaceChanged);
  }

  function setSourceFilter(next: SourceFilter) {
    setSourceFilterState(next);
    syncKnowledgeUrl(activeId, next);
  }

  useEffect(() => {
    let cancelled = false;
    api.workspaces().then(
      (data) => {
        if (cancelled) return;
        setWorkspaces(data);
        if (data.length > 0) {
          setActiveIdState((previous) => {
            const stillValid = previous !== null && data.some((workspace) => workspace.id === previous);
            return stillValid ? previous : data[0].id;
          });
        }
      },
      (requestError) => {
        if (!cancelled) {
          setError(apiErrorMessage(requestError, "Не удалось загрузить рабочие пространства."));
        }
      },
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
      setWorkspaces((previous) => [created, ...(previous ?? [])]);
      setActiveId(created.id);
      setNewName("");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Не удалось создать рабочее пространство."));
    } finally {
      setCreating(false);
    }
  }

  function requestDeleteWorkspace(workspace: Workspace, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDeleteTarget(workspace);
  }

  async function confirmDeleteWorkspace() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await api.deleteWorkspace(id);
      const remainingWorkspaces = (workspaces ?? []).filter((workspace) => workspace.id !== id);
      setWorkspaces(remainingWorkspaces);
      if (activeId === id) setActiveId(remainingWorkspaces[0]?.id ?? null);
      setDeleteTarget(null);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Не удалось удалить рабочее пространство."));
    } finally {
      setDeleting(false);
    }
  }

  const activeWorkspace = workspaces?.find((workspace) => workspace.id === activeId) ?? null;

  return (
    <section aria-label="Библиотека знаний" className="relative w-full flex-1 overflow-hidden px-3 pb-16 pt-6 min-[380px]:px-4 sm:px-6 sm:pt-9 xl:px-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_32%_10%,color-mix(in_srgb,var(--color-primary)_9%,transparent),transparent_58%)]"
      />
      <div className="relative mx-auto w-full max-w-[1540px]">
        <header className="flex flex-col gap-5 border-b border-border/70 pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-4xl">
              Knowledge
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Организуйте, находите и используйте информацию, которая действительно важна.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <a href="#knowledge-import" className="workspace-outline-button"><span aria-hidden="true">＋</span> Импорт</a>
            <a href="#knowledge-search" aria-label="Перейти к поиску" className="workspace-icon-button">⌕</a>
            <button
              type="button"
              aria-label={`Фильтр источников: ${SOURCE_FILTER_LABELS[sourceFilter]}`}
              title={`Показаны: ${SOURCE_FILTER_LABELS[sourceFilter]}`}
              onClick={() => setSourceFilter(sourceFilter === "all" ? "text" : sourceFilter === "text" ? "image" : "all")}
              className={`workspace-icon-button ${sourceFilter !== "all" ? "border-primary/45 text-primary" : ""}`}
            >▽</button>
            <button
              type="button"
              aria-label="Создать рабочее пространство"
              onClick={() => document.getElementById("knowledge-new-workspace")?.focus()}
              className="workspace-icon-button"
            >•••</button>
          </div>
        </header>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
            {error}
          </p>
        )}

        <section className="mt-6 rounded-2xl border border-border/75 bg-surface/45 p-2 shadow-[0_24px_70px_rgba(0,0,0,0.12)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Рабочие пространства" className="min-w-0 overflow-x-auto">
              <div className="flex min-w-max items-center gap-1">
                {workspaces === null && (
                  <p role="status" className="px-3 py-2 text-sm text-muted">
                    Загрузка…
                  </p>
                )}
                {workspaces?.map((workspace) => {
                  const active = activeId === workspace.id;
                  return (
                    <div key={workspace.id} className="group relative">
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setActiveId(workspace.id)}
                        className={`min-h-10 rounded-xl border px-3.5 pr-9 text-sm transition duration-200 active:scale-[0.98] ${
                          active
                            ? "border-primary/35 bg-primary/10 text-ink shadow-[inset_3px_0_0_color-mix(in_srgb,var(--color-primary)_75%,transparent)]"
                            : "border-transparent text-muted hover:border-border hover:bg-bg/55 hover:text-ink"
                        }`}
                      >
                        {workspace.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Удалить «${workspace.name}»`}
                        onClick={(event) => requestDeleteWorkspace(workspace, event)}
                        className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-lg text-muted/70 opacity-0 transition hover:bg-bg hover:text-danger focus:opacity-100 group-hover:opacity-100"
                      >
                        <KnowledgeIcon name="close" className="size-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </nav>

            <form
              className="flex min-w-0 items-center gap-2 border-t border-border/60 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0"
              onSubmit={(event) => {
                event.preventDefault();
                void createWorkspace();
              }}
            >
              <input
                id="knowledge-new-workspace"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Новое рабочее пространство"
                aria-label="Название нового рабочего пространства"
                maxLength={120}
                className="min-h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-bg/50 px-3 text-sm text-ink outline-none transition placeholder:text-muted focus:border-primary/40 lg:w-56"
              />
              <button
                type="submit"
                disabled={creating || !newName.trim()}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border border-border bg-bg/45 px-3.5 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-surface-raised active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <KnowledgeIcon name="plus" className="size-3.5" />
                {creating ? "Создаём…" : "Создать"}
              </button>
            </form>
          </div>
        </section>

        {activeId && activeWorkspace ? (
          <WorkspaceDetail
            key={activeId}
            workspaceId={activeId}
            workspaceName={activeWorkspace.name}
            sourceFilter={sourceFilter}
            onFilterChange={setSourceFilter}
          />
        ) : workspaces && workspaces.length === 0 ? (
          <EmptyWorkspace />
        ) : null}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Удалить «${deleteTarget?.name ?? ""}»?`}
        description="Все источники, чанки и история поиска этого рабочего пространства будут удалены безвозвратно."
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        pending={deleting}
        onConfirm={() => void confirmDeleteWorkspace()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

function EmptyWorkspace() {
  return (
    <section className="mt-8 flex min-h-80 flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-surface/25 px-6 text-center">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
        <KnowledgeIcon name="library" className="size-5" />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-ink">Создайте первое пространство</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">
        Разделяйте знания по проектам, продуктам или командам — каждый набор источников будет
        искать независимо.
      </p>
    </section>
  );
}

function WorkspaceDetail({
  workspaceId,
  workspaceName,
  sourceFilter,
  onFilterChange,
}: {
  workspaceId: number;
  workspaceName: string;
  sourceFilter: SourceFilter;
  onFilterChange: (next: SourceFilter) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sources, setSources] = useState<KnowledgeSource[] | null>(null);
  // Читает выбранный источник из `source` в URL (тот же приём, что и у
  // activeId/sourceFilter в Knowledge выше) — компонент пересоздаётся при
  // смене рабочего пространства (см. key={activeId} у вызывающего кода),
  // так что чтение при монтировании всегда соответствует текущему workspace.
  const [selectedSourceId, setSelectedSourceIdState] = useState<number | null>(() => {
    const raw = Number(searchParams.get("source"));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  });
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [submittingText, setSubmittingText] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ChunkMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  function setSelectedSourceId(next: number | null) {
    setSelectedSourceIdState(next);
    const query = new URLSearchParams(searchParams.toString());
    if (next !== null) query.set("source", String(next));
    else query.delete("source");
    const queryString = query.toString();
    router.replace(queryString ? `/knowledge?${queryString}` : "/knowledge", { scroll: false });
  }

  useEffect(() => {
    let cancelled = false;
    api.workspaceSources(workspaceId).then(
      (data) => {
        if (cancelled) return;
        setSources((previous) => {
          if (!previous) return data;
          const returnedIds = new Set(data.map((source) => source.id));
          const sourcesCreatedDuringLoad = previous.filter(
            (source) => !returnedIds.has(source.id),
          );
          return [...sourcesCreatedDuringLoad, ...data];
        });
      },
      (requestError) => {
        if (!cancelled) setError(apiErrorMessage(requestError, "Не удалось загрузить источники."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  function upsertSource(updated: KnowledgeSource) {
    setSources((previous) => {
      if (!previous) return [updated];
      const exists = previous.some((source) => source.id === updated.id);
      return exists
        ? previous.map((source) => (source.id === updated.id ? updated : source))
        : [updated, ...previous];
    });
  }

  function creditsErrorMessage(requestError: unknown): string {
    return requestError instanceof ApiError && requestError.status === 402
      ? "Недостаточно кредитов для добавления источника."
      : apiErrorMessage(requestError);
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
    } catch (requestError) {
      setError(creditsErrorMessage(requestError));
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
    } catch (requestError) {
      setError(creditsErrorMessage(requestError));
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
      setResults(await api.searchWorkspace(workspaceId, trimmed));
    } catch (requestError) {
      setSearchError(apiErrorMessage(requestError, "Поиск не удался."));
    } finally {
      setSearching(false);
    }
  }

  const selectedSource = useMemo(
    () => sources?.find((source) => source.id === selectedSourceId) ?? null,
    [selectedSourceId, sources],
  );
  const visibleSources = useMemo(
    () => sources?.filter((source) => sourceFilter === "all" || source.kind === sourceFilter) ?? null,
    [sourceFilter, sources],
  );
  const recentSources = useMemo(
    () =>
      [...(sources ?? [])]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 5),
    [sources],
  );
  const sourceCounts = useMemo(() => {
    const counts: Record<KnowledgeSource["kind"], number> = { text: 0, image: 0 };
    for (const source of sources ?? []) counts[source.kind] += 1;
    return counts;
  }, [sources]);

  return (
    <div className="mt-7">
      <section
        id="knowledge-import"
        aria-label="Импорт источника"
        className="overflow-hidden rounded-3xl border border-primary/25 bg-bg/70 shadow-[0_28px_90px_rgba(0,0,0,0.18)]"
      >
        <form
          className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void runSearch();
          }}
        >
          <div className="relative min-w-0 flex-1">
            <KnowledgeIcon name="search" className="pointer-events-none absolute left-4 top-1/2 size-4.5 -translate-y-1/2 text-muted" />
            <input
              id="knowledge-search"
              type="search"
              aria-label="Семантический поиск по пространству"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="О чём спросить это рабочее пространство?"
              className="min-h-12 w-full rounded-xl border border-border/70 bg-bg/55 pl-11 pr-4 text-[15px] text-ink outline-none transition placeholder:text-muted focus:border-primary/40"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-bg/55 px-5 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-surface-raised active:scale-[0.98] disabled:opacity-40"
          >
            {searching ? "Ищем…" : "Найти"}
          </button>
        </form>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="p-4 sm:p-5 lg:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <KnowledgeIcon name="plus" className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink">Добавить контекст</h2>
                <p className="mt-1 text-xs leading-5 text-muted">
                  Вставьте заметку, документ или любой фрагмент до 20 000 символов.
                </p>
              </div>
            </div>
            <textarea
              aria-label="Текст нового источника"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              maxLength={20000}
              className="mt-5 min-h-28 w-full resize-y border-0 bg-transparent text-[15px] leading-7 text-ink outline-none placeholder:text-muted"
              placeholder="Вставьте текст, который нужно проиндексировать"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border/65 pt-4">
              <span className="text-[11px] tabular-nums text-muted">{text.length.toLocaleString("ru-RU")} / 20 000</span>
              <button
                type="button"
                onClick={() => void submitText()}
                disabled={submittingText || !text.trim()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-contrast shadow-[0_10px_30px_color-mix(in_srgb,var(--color-primary)_16%,transparent)] transition hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <KnowledgeIcon name="arrow" className="size-3.5" />
                {submittingText ? "Добавляем…" : "Добавить"}
              </button>
            </div>
          </div>

          <div className="flex flex-col justify-between border-t border-border/70 bg-surface/45 p-4 sm:p-5 lg:border-l lg:border-t-0">
            <div>
              <span className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-bg/55 text-primary">
                <KnowledgeIcon name="image" className="size-4" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-ink">Распознать изображение</h3>
              <p className="mt-2 text-xs leading-5 text-muted">
                Загрузите схему, скриншот или скан. Текст попадёт в тот же смысловой индекс.
              </p>
            </div>
            <FileUploadButton
              accept="image/*"
              label={uploadingImage ? "Загружаем…" : "Загрузить изображение"}
              onFile={(file) => void submitImage(file)}
              disabled={uploadingImage}
              className="mt-6 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border bg-bg/55 px-4 text-sm font-medium text-ink transition hover:border-primary/35 hover:bg-surface-raised active:scale-[0.98] disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/70 bg-surface/25 p-3 sm:p-4">
          <span className="text-[11px] uppercase tracking-[0.08em] text-muted">Скоро:</span>
          {["Ссылка", "Notion", "Google Drive", "Confluence"].map((label) => (
            <button
              key={label}
              type="button"
              disabled
              aria-label={`${label} — появится позже`}
              className="inline-flex min-h-8 cursor-not-allowed items-center rounded-lg border border-border/60 bg-bg/40 px-3 text-xs font-medium text-muted opacity-60"
            >
              {label}
            </button>
          ))}
        </div>

      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {searchError && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/25 bg-danger/5 px-4 py-3 text-sm text-danger">
          {searchError}
        </p>
      )}
      {results && <SearchResults results={results} />}

      <div className="mt-7 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border/75 bg-surface/35">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-4 sm:px-5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-primary">{workspaceName}</p>
              <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Источники</h2>
            </div>
            <span className="rounded-lg border border-border/70 bg-bg/45 px-2.5 py-1 text-xs tabular-nums text-muted">
              {visibleSources?.length ?? 0}
            </span>
          </div>

          <div role="tablist" aria-label="Тип источника" className="flex items-center gap-1 border-b border-border/70 px-4 py-2 sm:px-5">
            {(["all", "text", "image"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                role="tab"
                aria-selected={sourceFilter === filter}
                onClick={() => onFilterChange(filter)}
                className={`min-h-8 rounded-lg px-3 text-xs font-medium capitalize transition ${
                  sourceFilter === filter
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:bg-surface-raised hover:text-ink"
                }`}
              >
                {SOURCE_FILTER_LABELS[filter]}
              </button>
            ))}
          </div>

          {sources === null ? (
            <p role="status" className="px-5 py-10 text-sm text-muted">
              Загрузка…
            </p>
          ) : visibleSources?.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center px-5 text-center">
              <KnowledgeIcon name="library" className="size-5 text-muted" />
              <p className="mt-3 text-sm font-medium text-ink">{sources.length === 0 ? "Здесь появятся ваши источники" : "Нет источников этого типа"}</p>
              <p className="mt-1 text-xs text-muted">{sources.length === 0 ? "Добавьте текст или изображение выше." : "Переключите фильтр в верхней панели."}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table aria-label="Источники знаний" className="w-full min-w-[680px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/65 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
                    <th scope="col" className="px-5 py-3.5">Источник</th>
                    <th scope="col" className="w-28 px-4 py-3.5">Тип</th>
                    <th scope="col" className="w-36 px-4 py-3.5">Статус</th>
                    <th scope="col" className="w-32 px-4 py-3.5">Добавлен</th>
                  </tr>
                </thead>
                <tbody>
                  {(visibleSources ?? []).map((source) => (
                    <SourceRow
                      key={source.id}
                      source={source}
                      active={source.id === selectedSourceId}
                      onSelect={() => setSelectedSourceId(source.id)}
                      onUpdate={upsertSource}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <SourceDetail source={selectedSource} />
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <section aria-label="Недавние источники" className="rounded-2xl border border-border/75 bg-surface/35 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <KnowledgeIcon name="clock" className="size-4 text-muted" />
              Недавние источники
            </h2>
            {sources && sources.length > recentSources.length && (
              <button
                type="button"
                onClick={() => onFilterChange("all")}
                className="text-xs font-medium text-primary transition hover:underline"
              >
                Показать все
              </button>
            )}
          </div>
          {recentSources.length === 0 ? (
            <p className="mt-4 text-xs text-muted">Пока нет источников.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-0.5">
              {recentSources.map((source) => (
                <li key={source.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedSourceId(source.id)}
                    aria-current={source.id === selectedSourceId ? "true" : undefined}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 text-left transition duration-150 hover:bg-surface-raised aria-[current=true]:bg-primary/8"
                  >
                    <KnowledgeIcon name={source.kind === "image" ? "image" : "document"} className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{sourceTitle(source)}</span>
                    <span className="shrink-0 text-[11px] text-muted">{formatSourceDate(source.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Коллекции" className="rounded-2xl border border-border/75 bg-surface/35 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <KnowledgeIcon name="folder" className="size-4 text-muted" />
            Коллекции
          </h2>
          <div className="mt-2 flex flex-col gap-0.5">
            {(
              [
                ["text", "Текстовые заметки"],
                ["image", "Изображения"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={sourceFilter === kind}
                onClick={() => onFilterChange(sourceFilter === kind ? "all" : kind)}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 text-left transition duration-150 hover:bg-surface-raised aria-pressed:bg-primary/8 aria-pressed:text-ink"
              >
                <span className="flex min-w-0 items-center gap-2.5 text-sm text-ink">
                  <KnowledgeIcon name={kind === "image" ? "image" : "document"} className="size-4 shrink-0 text-muted" />
                  {label}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{sourceCounts[kind]}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <EmbedWidgetsSection workspaceId={workspaceId} />
    </div>
  );
}

function embedSnippet(publicKey: string): string {
  return `<script src="https://lumenza.app/static/embed.js" data-key="${publicKey}"></script>`;
}

function EmbedWidgetsSection({ workspaceId }: { workspaceId: number }) {
  const [widgets, setWidgets] = useState<EmbedWidgetEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<EmbedWidgetEntry | null>(null);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.embedWidgets(workspaceId).then(
      (data) => {
        if (!cancelled) setWidgets(data);
      },
      (requestError) => {
        if (!cancelled) setError(apiErrorMessage(requestError, "Не удалось загрузить виджеты."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  async function create() {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createEmbedWidget(workspaceId, title.trim());
      setWidgets((previous) => [created, ...(previous ?? [])]);
      setTitle("");
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Не удалось создать виджет."));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(widget: EmbedWidgetEntry) {
    try {
      const updated = await api.setEmbedWidgetActive(widget.id, !widget.is_active);
      setWidgets((previous) => previous?.map((item) => (item.id === updated.id ? updated : item)) ?? previous);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Не удалось обновить виджет."));
    }
  }

  async function confirmRemove() {
    if (!removeTarget) return;
    const widget = removeTarget;
    setRemoving(true);
    try {
      await api.deleteEmbedWidget(widget.id);
      setWidgets((previous) => previous?.filter((item) => item.id !== widget.id) ?? previous);
      setRemoveTarget(null);
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Не удалось удалить виджет."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section aria-label="Публичный виджет" className="mt-5 rounded-2xl border border-border/75 bg-surface/35 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-ink">Публичный виджет</h2>
      <p className="mt-1 text-xs text-muted">
        Встройте чат-бота на свой сайт — посетители смогут задавать вопросы по этой базе знаний без входа в Lumenza.
      </p>

      <div className="mt-3 flex gap-2">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Название виджета (необязательно)"
          aria-label="Название виджета"
          className="input"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="btn-secondary shrink-0"
        >
          {creating ? "Создаём…" : "+ Создать"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}

      {widgets && widgets.length > 0 && (
        <ul className="mt-4 flex flex-col gap-3">
          {widgets.map((widget) => (
            <li key={widget.id} className="rounded-xl border border-border/70 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink">{widget.title || "Без названия"}</span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void toggleActive(widget)}
                    className="text-xs font-medium text-primary underline"
                  >
                    {widget.is_active ? "Отключить" : "Включить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(widget)}
                    className="text-xs font-medium text-danger underline"
                  >
                    Удалить
                  </button>
                </div>
              </div>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-bg/50 p-2 font-mono text-xs text-muted">
                {embedSnippet(widget.public_key)}
              </pre>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removeTarget !== null}
        title={`Удалить виджет «${removeTarget?.title || "Без названия"}»?`}
        description="Встроенный на сайте чат-бот перестанет работать сразу после удаления."
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        pending={removing}
        onConfirm={() => void confirmRemove()}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}

function SearchResults({ results }: { results: ChunkMatch[] }) {
  return (
    <section className="mt-5 rounded-2xl border border-border/70 bg-surface/30 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-ink">Результаты смыслового поиска</h2>
        <span className="text-xs tabular-nums text-muted">{results.length}</span>
      </div>
      {results.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Ничего не найдено.</p>
      ) : (
        <ul className="mt-4 grid gap-3 lg:grid-cols-2">
          {results.map((match) => (
            <li key={match.id} className="rounded-xl border border-border/65 bg-bg/50 p-4">
              <p className="line-clamp-4 text-sm leading-6 text-ink">{match.text}</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-border/60">
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${Math.max(4, Math.min(100, match.score * 100))}%` }}
                />
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted">score {match.score.toFixed(3)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceDetail({ source }: { source: KnowledgeSource | null }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <aside
      aria-label="Детали источника"
      className="overflow-hidden rounded-2xl border border-border/75 bg-surface/40 xl:sticky xl:top-6"
    >
      <div className="border-b border-border/70 px-5 py-4">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-primary">Инспектор</p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-ink">Детали источника</h2>
      </div>
      {source ? (
        <motion.div
          key={source.id}
          className="p-5"
          initial={shouldReduceMotion ? false : { opacity: 0, x: 18 }}
          animate={{ opacity: 1, x: 0 }}
          transition={shouldReduceMotion ? { duration: 0 } : redesignMotion.panel}
        >
          <div className="flex items-start justify-between gap-4">
            <span className="inline-flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <KnowledgeIcon name={source.kind === "image" ? "image" : "document"} className="size-4.5" />
            </span>
            <span className={`status-pill ${statusPillClass(source.status)}`}>
              {SOURCE_STATUS_LABELS[source.status]}
            </span>
          </div>
          <p className="mt-5 text-xs font-medium text-muted">
            {source.kind === "image" ? "Изображение" : "Текст"}
          </p>
          <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-ink">
            {source.raw_text || source.error_message || "Источник ещё обрабатывается."}
          </p>
          <dl className="mt-6 divide-y divide-border/60 border-y border-border/60 text-xs">
            <DetailLine label="Добавлен" value={formatSourceDate(source.created_at)} />
            <DetailLine label="Кредиты" value={source.credits_charged || "0"} />
            <DetailLine label="Идентификатор" value={`#${source.id}`} />
            <DetailLine label="Режим" value={source.mocked ? "Тестовый" : "Рабочий"} />
          </dl>
          {source.status === "error" && (
            <p className="mt-4 rounded-xl border border-danger/25 bg-danger/5 p-3 text-xs leading-5 text-danger">
              {source.error_message || "Не удалось обработать источник."}
            </p>
          )}
        </motion.div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="inline-flex size-10 items-center justify-center rounded-xl border border-border bg-bg/45 text-muted">
            <KnowledgeIcon name="cursor" className="size-4" />
          </span>
          <p className="mt-4 text-sm font-medium text-ink">Выберите источник</p>
          <p className="mt-2 text-xs leading-5 text-muted">
            Здесь появятся содержимое, статус обработки и расход кредитов.
          </p>
        </div>
      )}
    </aside>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="max-w-[60%] truncate text-right tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function SourceRow({
  source,
  active,
  onSelect,
  onUpdate,
}: {
  source: KnowledgeSource;
  active: boolean;
  onSelect: () => void;
  onUpdate: (source: KnowledgeSource) => void;
}) {
  usePolledStatus(source, SOURCE_IN_PROGRESS, api.sourceStatus, onUpdate, () => undefined);

  return (
    <tr className={`border-b border-border/55 last:border-b-0 ${active ? "bg-primary/5" : "hover:bg-bg/40"}`}>
      <td className="p-0">
        <button
          type="button"
          aria-label={`Открыть источник ${source.id}`}
          aria-pressed={active}
          onClick={onSelect}
          className="group flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left transition"
        >
          <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border transition ${active ? "border-primary/25 bg-primary/10 text-primary" : "border-border bg-bg/50 text-muted group-hover:text-ink"}`}>
            <KnowledgeIcon name={source.kind === "image" ? "image" : "document"} className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">{sourceTitle(source)}</span>
            <span className="mt-1 block truncate text-[11px] text-muted">Источник #{source.id}</span>
          </span>
        </button>
      </td>
      <td className="px-4 py-3 text-xs text-muted">{source.kind === "image" ? "Изображение" : "Текст"}</td>
      <td className="px-4 py-3">
        <span className={`status-pill ${statusPillClass(source.status)}`}>
          {SOURCE_STATUS_LABELS[source.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-xs tabular-nums text-muted">{formatSourceDate(source.created_at)}</td>
    </tr>
  );
}

function sourceTitle(source: KnowledgeSource): string {
  const normalized = source.raw_text.replace(/\s+/g, " ").trim();
  if (normalized) return normalized;
  if (source.status === "error") return source.error_message || "Ошибка обработки";
  return source.kind === "image" ? "Новое изображение" : "Новый текст";
}

function formatSourceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" }).format(date);
}

type KnowledgeIconName = "arrow" | "close" | "cursor" | "document" | "folder" | "clock" | "image" | "library" | "plus" | "search" | "spark";

function KnowledgeIcon({ name, className }: { name: KnowledgeIconName; className?: string }) {
  const paths: Record<KnowledgeIconName, React.ReactNode> = {
    arrow: <path d="m6 12 6-6 6 6M12 6v12" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    cursor: <path d="m6 4 12 8-6 2-2 6-4-16Z" />,
    document: <path d="M7 3h7l4 4v14H7V3Zm7 0v5h5M10 12h5M10 16h5" />,
    folder: <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4l2 2h7A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z" />,
    clock: <path d="M12 7v5l3.5 2M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    image: <path d="M4 5h16v14H4V5Zm3 11 4-4 3 3 2-2 4 4M16 9h.01" />,
    library: <path d="M5 4h4v16H5V4Zm5 0h4v16h-4V4Zm5 2 4-1 2 14-4 1-2-14Z" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <path d="m20 20-4.4-4.4M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" />,
    spark: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Z" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {paths[name]}
    </svg>
  );
}
