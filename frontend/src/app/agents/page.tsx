"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { GoalCard } from "@/components/goal-card";
import { ModelPicker } from "@/components/model-picker";
import { springs } from "@/lib/motion";
import {
  api,
  apiErrorMessage,
  type AgentCategory,
  type AgentSummary,
  type CustomAgentSummary,
  type ModelProgress,
} from "@/lib/api";

type CategoryFilter = "all" | AgentCategory | "mine";

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  content: "Контент",
  research: "Исследования",
  documents: "Документы",
};

// "Популярное" всегда первая и показывает весь каталог без фильтра — только
// категории с хотя бы одним реально работающим агентом получают свою
// вкладку (см. SPEC.md Phase 16: без вкладок-заглушек без фичи за ними).
// "Мои агенты" (item 10) идёт последней и не фильтрует каталог — это
// отдельный источник данных (api.customAgents()), не категория.
const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "Популярное" },
  { key: "content", label: "Контент" },
  { key: "research", label: "Исследования" },
  { key: "documents", label: "Документы" },
  { key: "mine", label: "Мои агенты" },
];

export default function AgentsPage() {
  return (
    /* useSearchParams() выводит поддерево из статического рендеринга, если
       оно не изолировано за Suspense — тот же паттерн, что и в /studio. */
    <Suspense fallback={null}>
      <Agents />
    </Suspense>
  );
}

function Agents() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();

  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [models, setModels] = useState<ModelProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedModelTask, setSelectedModelTask] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.agents().then(
      (data) => {
        if (!cancelled) setAgents(data);
      },
      (err) => {
        if (!cancelled) setError(apiErrorMessage(err, "Не удалось загрузить агентов."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.modelsCatalog().then(
      (data) => { if (!cancelled) setModels(data); },
      () => { if (!cancelled) setModels([]); },
    );
    return () => { cancelled = true; };
  }, []);

  // Same "local state reconciled against the query string" pattern as
  // /studio's modeState — clicking a tab updates the filter immediately
  // instead of waiting a render for the router to settle.
  const queryKey = searchParams.toString();
  const requestedCategory = parseCategory(searchParams.get("category"));
  const [categoryState, setCategoryState] = useState<{
    queryKey: string;
    category: CategoryFilter;
  }>(() => ({ queryKey, category: requestedCategory ?? "all" }));

  if (categoryState.queryKey !== queryKey) {
    setCategoryState({ queryKey, category: requestedCategory ?? categoryState.category });
  }

  const category = categoryState.category;

  function selectCategory(next: CategoryFilter) {
    if (next === category) return;
    setCategoryState({ queryKey, category: next });
    router.replace(next === "all" ? "/agents" : `/agents?category=${next}`, { scroll: false });
  }

  const visibleAgents =
    agents === null
      ? null
      : category === "all"
        ? agents
        : agents.filter((agent) => agent.category === category);
  const activeCategoryLabel = CATEGORIES.find((item) => item.key === category)?.label ?? "Популярное";
  const selectableAgents = category === "mine" ? [] : visibleAgents ?? [];
  const selectedAgent =
    selectableAgents.find((agent) => agent.slug === selectedAgentSlug) ?? selectableAgents[0] ?? null;

  function startAgentChat(event: FormEvent) {
    event.preventDefault();
    if (!selectedAgent) return;
    const draft = prompt.trim();
    if (draft) {
      try {
        sessionStorage.setItem(`lumenza:agent-draft:${selectedAgent.slug}`, draft);
      } catch {
        // Storage can be disabled by privacy settings. Navigation must still work;
        // the user can paste the draft into the agent form after the transition.
      }
    }
    try {
      const preferenceKey = `lumenza:agent-model:${selectedAgent.slug}`;
      if (selectedModel) sessionStorage.setItem(preferenceKey, selectedModel);
      else sessionStorage.removeItem(preferenceKey);
    } catch {
      // The workflow still starts with automatic routing if private storage
      // is unavailable.
    }
    router.push(`/agents/${selectedAgent.slug}`);
  }

  return (
    <div className="agent-workspace mx-auto w-full max-w-5xl flex-1 px-3 py-6 min-[380px]:px-4 sm:px-6 sm:py-10">
      <section aria-label="Чат агентов" className="agent-chat-hero">
        <motion.div
          layoutId="lumenza-workspace-core"
          className="agent-orbit-mark"
          transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
          aria-hidden="true"
        >
          <span /><span /><span />
        </motion.div>
        <div className="agent-hero-copy">
          <p className="agent-mode-label">Агентный режим</p>
          <h1>Поставьте цель. Агент соберёт результат.</h1>
          <p>
            Это отдельное рабочее пространство: обычные диалоги остаются в Chat,
            а здесь выполняются многошаговые сценарии с понятным прогрессом.
          </p>
          <span className="agent-active-domain" data-active-domain="">
            Активная область: {activeCategoryLabel}
          </span>
        </div>

        <motion.form
          layoutId="lumenza-workspace-composer"
          transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
          aria-label="Запустить агента"
          onSubmit={startAgentChat}
          className="agent-composer"
        >
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Опишите результат, который хотите получить"
            aria-label="Задача агенту"
            rows={5}
          />
          <div className="agent-composer-footer">
            <ModelPicker
              models={models}
              selectedModel={selectedModel}
              selectedTask={selectedModelTask}
              onSelect={(model, task) => {
                setSelectedModel(model);
                setSelectedModelTask(task);
              }}
            />
            <AgentModeMenu />
            <label className="agent-selector">
              <span className="sr-only">Выбрать агента</span>
              <select
                aria-label="Выбрать агента"
                value={selectedAgent?.slug ?? ""}
                onChange={(event) => setSelectedAgentSlug(event.target.value)}
                disabled={selectableAgents.length === 0}
              >
                {selectableAgents.map((agent) => <option key={agent.slug} value={agent.slug}>{agent.name}</option>)}
              </select>
            </label>
            <span role="status" aria-label={`Активная возможность: ${activeCategoryLabel}`} className="agent-capability-chip">
              {activeCategoryLabel}
            </span>
            <span className="agent-routing-note">Предпочтение применяется к совместимым шагам</span>
            <motion.button
              type="submit"
              disabled={!selectedAgent}
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              className="btn-primary"
            >
              Продолжить
            </motion.button>
          </div>
        </motion.form>
      </section>

      <nav
        aria-label="Категория агентов"
        data-testid="agents-category-navigation"
        className="agent-domain-navigation mt-7 flex flex-wrap items-center gap-1 min-[380px]:gap-2"
      >
        {CATEGORIES.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={category === option.key}
            onClick={() => selectCategory(option.key)}
            className={`relative isolate inline-flex min-h-9 items-center overflow-hidden rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 min-[380px]:px-3.5 min-[380px]:text-sm ${
              category === option.key
                ? "border-primary/50 text-ink"
                : "border-border bg-surface/75 text-muted hover:border-primary/25 hover:text-ink"
            }`}
          >
            {category === option.key && (
              <motion.span
                layoutId="agents-active-category"
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-full bg-primary/12"
                transition={shouldReduceMotion ? { duration: 0 } : springs.snappy}
              />
            )}
            <span className="relative">{option.label}</span>
          </button>
        ))}
      </nav>

      <AgentCapabilityRail />

      {category === "mine" ? (
        <MyAgents catalog={agents} />
      ) : (
        <>
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}

          {!error && visibleAgents === null && (
            <p role="status" className="mt-10 text-sm text-muted">
              Загрузка…
            </p>
          )}

          {visibleAgents && visibleAgents.length > 0 && (
            <div className="agent-card-grid mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleAgents.map((agent, index) => (
                <GoalCard
                  key={agent.slug}
                  index={index}
                  href={`/agents/${agent.slug}`}
                  title={agent.name}
                  description={agent.description}
                />
              ))}
            </div>
          )}

          {visibleAgents && visibleAgents.length === 0 && (
            <p className="mt-10 text-sm text-muted">В этой категории пока нет агентов.</p>
          )}
        </>
      )}
    </div>
  );
}

function AgentModeMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="agent-mode-picker">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Режим: AI Agent"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        AI Agent <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div role="menu" aria-label="Режим Lumenza" className="agent-mode-menu">
          <Link href="/chat" aria-label="Chat"><strong>Chat</strong><span>Обычный диалог с AI</span></Link>
          <Link href="/agents" aria-label="AI Agent" aria-current="page"><strong>AI Agent</strong><span>Многошаговые workflow</span></Link>
          <Link href="/knowledge" aria-label="Knowledge"><strong>Knowledge</strong><span>Ответы по вашим источникам</span></Link>
        </div>
      )}
    </div>
  );
}

const CAPABILITY_LINKS = [
  ["Featured", "/agents"],
  ["Agent workflows", "/agents"],
  ["Research", "/agents?category=research"],
  ["Documents", "/agents?category=documents"],
  ["Knowledge", "/knowledge"],
  ["Code", "/studio?mode=code"],
  ["Videos", "/studio?mode=video"],
  ["Audio", "/studio?mode=audio"],
  ["Apps", "/studio?view=apps"],
  ["All tools", "/studio?view=tools"],
] as const;

function AgentCapabilityRail() {
  return (
    <nav aria-label="Возможности Lumenza" className="agent-capability-rail">
      {CAPABILITY_LINKS.map(([label, href]) => <Link key={label} href={href}>{label}</Link>)}
    </nav>
  );
}

// Item 10 ("Мои агенты"): combine 2-3 whole existing published catalog
// agents (spanning ≥2 categories) into one custom agent, chained via the
// unmodified run engine — see agents.services.create_custom_agent. `catalog`
// is the already-fetched global agent list, reused as the builder's picker
// source instead of a second fetch.
function MyAgents({ catalog }: { catalog: AgentSummary[] | null }) {
  const router = useRouter();
  const [myAgents, setMyAgents] = useState<CustomAgentSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    api.customAgents().then(setMyAgents, (err) =>
      setError(apiErrorMessage(err, "Не удалось загрузить ваши агенты."))
    );
  }, []);

  function toggleSelected(slug: string) {
    setSelected((prev) =>
      prev.includes(slug)
        ? prev.filter((item) => item !== slug)
        : prev.length < 3
          ? [...prev, slug]
          : prev
    );
  }

  const selectedCategories = new Set(
    (catalog ?? []).filter((agent) => selected.includes(agent.slug)).map((agent) => agent.category)
  );
  const canCreate =
    selected.length >= 2 &&
    selected.length <= 3 &&
    selectedCategories.size >= 2 &&
    name.trim().length > 0;

  async function create() {
    if (!canCreate || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createCustomAgent(name.trim(), description.trim(), selected);
      router.push(`/agents/${created.slug}`);
    } catch (err) {
      setCreateError(apiErrorMessage(err, "Не удалось создать агента."));
      setCreating(false);
    }
  }

  async function archive(slug: string) {
    try {
      await api.archiveCustomAgent(slug);
      setMyAgents((prev) => prev?.filter((agent) => agent.slug !== slug) ?? prev);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось архивировать агента."));
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setBuilderOpen((prev) => !prev)}
        className="btn-secondary"
      >
        {builderOpen ? "Отмена" : "+ Создать агента"}
      </button>

      {builderOpen && (
        <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          <p className="text-sm text-muted">
            Выберите 2–3 агента из разных категорий — они выполнятся по очереди, каждый
            следующий увидит результаты предыдущих.
          </p>

          {catalog === null && <p className="text-sm text-muted">Загрузка каталога…</p>}

          {catalog && (
            <div className="flex flex-col gap-1.5">
              {catalog.map((agent) => (
                <label
                  key={agent.slug}
                  className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(agent.slug)}
                    onChange={() => toggleSelected(agent.slug)}
                  />
                  <span className="text-ink">{agent.name}</span>
                  <span className="text-xs text-muted">{CATEGORY_LABELS[agent.category]}</span>
                </label>
              ))}
            </div>
          )}

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название"
            className="input"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Описание (необязательно)"
            className="input"
          />

          {selected.length >= 2 && selectedCategories.size < 2 && (
            <p className="text-sm text-danger">Выберите агентов минимум из 2 разных категорий.</p>
          )}
          {createError && (
            <p role="alert" className="text-sm text-danger">
              {createError}
            </p>
          )}

          <button
            type="button"
            onClick={() => void create()}
            disabled={!canCreate || creating}
            className="btn-primary self-start"
          >
            {creating ? "Создаём…" : "Создать"}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && myAgents === null && (
        <p role="status" className="mt-6 text-sm text-muted">
          Загрузка…
        </p>
      )}

      {myAgents && myAgents.length === 0 && !builderOpen && (
        <p className="mt-6 text-sm text-muted">У вас пока нет собственных агентов.</p>
      )}

      {myAgents && myAgents.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2">
          {myAgents.map((agent) => (
            <li
              key={agent.slug}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface p-4"
            >
              <Link href={`/agents/${agent.slug}`} className="flex-1">
                <h2 className="text-sm font-medium text-ink">{agent.name}</h2>
                <p className="mt-1 text-sm text-muted">
                  {agent.source_agent_slugs.join(" → ") || agent.description}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => void archive(agent.slug)}
                className="shrink-0 text-xs text-muted underline hover:text-danger"
              >
                Архивировать
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function parseCategory(value: string | null): CategoryFilter | null {
  return value === "content" || value === "research" || value === "documents" || value === "mine"
    ? value
    : null;
}
