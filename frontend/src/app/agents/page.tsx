"use client";

import { Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GoalCard } from "@/components/goal-card";
import { ModelPicker } from "@/components/model-picker";
import { WorkspaceAccountAvatar } from "@/components/workspace-top-actions";
import { springs } from "@/lib/motion";
import { statusPillClass } from "@/lib/status-styles";
import {
  api,
  apiErrorMessage,
  type AgentCategory,
  type AgentDetail,
  type AgentSummary,
  type CustomAgentSummary,
  type ModelProgress,
  type SwarmRun,
} from "@/lib/api";

type CategoryFilter = "all" | AgentCategory | "mine" | "swarm";

const CATEGORY_LABELS: Record<AgentCategory, string> = {
  content: "Контент",
  research: "Исследования",
  documents: "Документы",
  finance: "Финансы",
  code: "Код",
  video: "Видео",
  audio: "Аудио",
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
  { key: "finance", label: "Финансы" },
  { key: "code", label: "Код" },
  { key: "video", label: "Видео" },
  { key: "audio", label: "Аудио" },
  { key: "mine", label: "Мои агенты" },
  { key: "swarm", label: "Рой агентов" },
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
  const selectableAgents =
    category === "mine" || category === "swarm" ? [] : visibleAgents ?? [];
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
    <div className="agent-workspace mx-auto w-full max-w-[92rem] flex-1 px-3 pb-10 min-[380px]:px-4 sm:px-8 lg:px-10">
      <header aria-label="Agents workspace" className="agent-workspace-header">
        <div>
          <h1>Agents</h1>
          <p>Ваша AI-команда. Специализированная, связанная и готовая к работе.</p>
        </div>
        <div className="workspace-top-actions">
          <Link href="/agents?category=mine" aria-label="Мои агенты" className="workspace-outline-button"><span aria-hidden="true">＋</span> Новый агент</Link>
          <WorkspaceAccountAvatar />
        </div>
      </header>
      <section aria-label="Чат агентов" className="agent-chat-hero">
        <motion.div
          layoutId="lumenza-workspace-core"
          className="agent-orbit-mark"
          transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
          aria-hidden="true"
          data-testid="agents-network"
        >
          <svg className="agent-orbit-connectors" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="50" y1="50" x2="13" y2="36" />
            <line x1="50" y1="50" x2="49" y2="4" />
            <line x1="50" y1="50" x2="88" y2="28" />
            <line x1="50" y1="50" x2="22" y2="89" />
            <line x1="50" y1="50" x2="81" y2="93" />
          </svg>
          <i className="agent-orbit-particle" style={{ left: "28%", top: "12%" }} />
          <i className="agent-orbit-particle" style={{ left: "8%", top: "62%" }} />
          <i className="agent-orbit-particle" style={{ left: "55%", top: "95%" }} />
          <b aria-hidden="true"><HubIcon /></b>
          <span data-agent-node data-tone="cyan" data-label="Research Agent"><OrbitNodeIcon kind="research" /></span>
          <span data-agent-node data-tone="gold" data-label="Executive Agent"><OrbitNodeIcon kind="executive" /></span>
          <span data-agent-node data-tone="cyan" data-label="Content Agent"><OrbitNodeIcon kind="content" /></span>
          <span data-agent-node data-tone="cyan" data-label="Data Analyst"><OrbitNodeIcon kind="data" /></span>
          <span data-agent-node data-tone="cyan" data-label="Automation Agent"><OrbitNodeIcon kind="automation" /></span>
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
          <h2>Что должна сделать ваша AI-команда?</h2>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Опишите результат, который хотите получить"
            aria-label="Задача агенту"
            rows={2}
          />
          <div className="agent-composer-footer">
            <div className="agent-field">
              <span className="agent-field-label">Model</span>
              <ModelPicker
                models={models}
                selectedModel={selectedModel}
                selectedTask={selectedModelTask}
                onSelect={(model, task) => {
                  setSelectedModel(model);
                  setSelectedModelTask(task);
                }}
              />
            </div>
            <div className="agent-field">
              <span className="agent-field-label">Mode</span>
              <AgentModeMenu />
            </div>
            <div className="agent-field">
              <span className="agent-field-label">Agent</span>
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
            </div>
            <div className="agent-field">
              <span className="agent-field-label">Domain</span>
              <span role="status" aria-label={`Активная возможность: ${activeCategoryLabel}`} className="agent-capability-chip">
                {activeCategoryLabel}
              </span>
            </div>
            <span className="agent-routing-note">Предпочтение применяется к совместимым шагам</span>
            <motion.button
              type="submit"
              disabled={!selectedAgent}
              aria-label="Продолжить"
              title="Продолжить"
              whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
              className="agent-composer-submit"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M10 15V5m0 0L6 9m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
      ) : category === "swarm" ? (
        <SwarmBuilder catalog={agents} />
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
            <div className="agent-card-grid mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {visibleAgents.map((agent, index) => (
                <GoalCard
                  key={agent.slug}
                  index={index}
                  href={`/agents/${agent.slug}`}
                  title={agent.name}
                  description={agent.description}
                  icon={<CategoryIcon category={agent.category} />}
                />
              ))}
            </div>
          )}

          {visibleAgents && visibleAgents.length === 0 && (
            <p className="mt-10 text-sm text-muted">В этой категории пока нет агентов.</p>
          )}
        </>
      )}
      <footer className="agent-trust-footer" aria-label="Гарантии Lumenza">
        <span><TrustIcon variant="shield" /> Корпоративная безопасность</span>
        <span><TrustIcon variant="home" /> Ваши данные остаются приватными</span>
        <span><TrustIcon variant="badge" /> SOC 2 Type II</span>
        <span><TrustIcon variant="clock" /> Стабильная работа 99.9%</span>
        <Link href="/about" className="agent-trust-footer-link">
          <TrustIcon variant="help" /> Подробнее об Агентах <span aria-hidden="true">↗</span>
        </Link>
        <Link href="/privacy" className="agent-trust-footer-link">Политика конфиденциальности</Link>
        <Link href="/terms" className="agent-trust-footer-link">Условия использования</Link>
      </footer>
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

type OrbitNodeKind = "research" | "executive" | "content" | "data" | "automation";

type TrustIconKind = "shield" | "home" | "badge" | "clock" | "help";

function TrustIcon({ variant }: { variant: TrustIconKind }) {
  const common = { viewBox: "0 0 20 20", className: "size-3.5 shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  if (variant === "shield") return <svg aria-hidden="true" {...common}><path d="M10 2.5 16 5v4.5C16 13.5 13.5 16 10 17.5 6.5 16 4 13.5 4 9.5V5Z" strokeLinejoin="round" /></svg>;
  if (variant === "home") return <svg aria-hidden="true" {...common}><path d="M3.5 9.5 10 4l6.5 5.5M5.5 8.5V16h9V8.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (variant === "badge") return <svg aria-hidden="true" {...common}><path d="M10 2.5 16 5v4.5C16 13.5 13.5 16 10 17.5 6.5 16 4 13.5 4 9.5V5Z" strokeLinejoin="round" /><path d="m7.5 9.8 1.8 1.8 3.2-3.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (variant === "clock") return <svg aria-hidden="true" {...common}><circle cx="10" cy="10" r="7" /><path d="M10 6.5V10l2.5 1.5" strokeLinecap="round" /></svg>;
  return <svg aria-hidden="true" {...common}><circle cx="10" cy="10" r="7" /><path d="M8.2 8a1.8 1.8 0 1 1 2.5 1.6c-.5.25-.7.55-.7 1.1" strokeLinecap="round" /><path d="M10 13.5v.01" strokeLinecap="round" /></svg>;
}

// Central hub glyph — traced from docs/redesign-references/detail-crops
// (approved/agents.png hero center), a distribution/network icon rather
// than the generic sparkle placeholder it replaced.
function HubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className="size-9" fill="none">
      <defs>
        <linearGradient id="agent-hub-gradient" x1="10" y1="5" x2="90" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--gold-hover)" />
          <stop offset="1" stopColor="var(--gold-active)" />
        </linearGradient>
      </defs>
      <g stroke="url(#agent-hub-gradient)" strokeWidth="1.6" strokeLinecap="round">
        <line x1="50" y1="14" x2="50" y2="20" />
        <line x1="30" y1="27" x2="41" y2="35" />
        <line x1="70" y1="27" x2="59" y2="35" />
        <line x1="14" y1="50" x2="30" y2="50" />
        <line x1="86" y1="50" x2="70" y2="50" />
        <line x1="30" y1="73" x2="41" y2="65" />
        <line x1="70" y1="73" x2="59" y2="65" />
        <line x1="50" y1="86" x2="50" y2="80" />
      </g>
      <rect x="46" y="17" width="8" height="66" rx="4" fill="url(#agent-hub-gradient)" />
      <rect x="26" y="32" width="8" height="36" rx="4" fill="url(#agent-hub-gradient)" />
      <rect x="66" y="32" width="8" height="36" rx="4" fill="url(#agent-hub-gradient)" />
      <circle cx="50" cy="9" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="24" cy="23" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="76" cy="23" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="9" cy="50" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="91" cy="50" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="24" cy="77" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="76" cy="77" r="4.5" fill="url(#agent-hub-gradient)" />
      <circle cx="50" cy="91" r="4.5" fill="url(#agent-hub-gradient)" />
    </svg>
  );
}

function OrbitNodeIcon({ kind }: { kind: OrbitNodeKind }) {
  const common = { viewBox: "0 0 24 24", className: "size-4.5", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  if (kind === "research") return <svg aria-hidden="true" {...common}><circle cx="10.5" cy="10.5" r="6" /><path d="m19 19-4.3-4.3" strokeLinecap="round" /></svg>;
  if (kind === "executive") return <svg aria-hidden="true" {...common}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5" strokeLinecap="round" /></svg>;
  if (kind === "content") return <svg aria-hidden="true" {...common}><path d="M6 19.5 4 20l.5-2 11-11 2 2Z" strokeLinejoin="round" /><path d="m14 6.5 2-2 2 2-2 2Z" strokeLinejoin="round" /></svg>;
  if (kind === "data") return <svg aria-hidden="true" {...common}><path d="M5 19V9m7 10V5m7 14v-7" strokeLinecap="round" /><path d="M3.5 19.5h17" strokeLinecap="round" /></svg>;
  return <svg aria-hidden="true" {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" strokeLinecap="round" /></svg>;
}

function CategoryIcon({ category }: { category: AgentCategory }) {
  const common = { viewBox: "0 0 24 24", className: "size-4.5", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  if (category === "research") return <svg aria-hidden="true" {...common}><circle cx="10.5" cy="10.5" r="6" /><path d="m19 19-4.3-4.3" strokeLinecap="round" /></svg>;
  if (category === "content") return <svg aria-hidden="true" {...common}><path d="M6 19.5 4 20l.5-2 11-11 2 2Z" strokeLinejoin="round" /><path d="m14 6.5 2-2 2 2-2 2Z" strokeLinejoin="round" /></svg>;
  if (category === "finance") return <svg aria-hidden="true" {...common}><path d="M4 19.5v-6l4-3 4 2.5 4-5 4 3v8.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 19.5h17" strokeLinecap="round" /></svg>;
  if (category === "code") return <svg aria-hidden="true" {...common}><path d="m9 8-4.5 4L9 16M15 8l4.5 4-4.5 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (category === "video") return <svg aria-hidden="true" {...common}><rect x="3.5" y="6" width="12" height="12" rx="1.5" /><path d="m20.5 8.5-5 3.5 5 3.5Z" strokeLinejoin="round" /></svg>;
  if (category === "audio") return <svg aria-hidden="true" {...common}><path d="M4 10v4h3.5L12 17.5v-11L7.5 10Z" strokeLinejoin="round" /><path d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10" strokeLinecap="round" /></svg>;
  return <svg aria-hidden="true" {...common}><path d="M7 3.5h7l3 3v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1Z" /><path d="M14 3.5v3h3M9 12h6M9 15.5h6" strokeLinecap="round" /></svg>;
}

type CapabilityIconKind = "research" | "data" | "content" | "strategy" | "automation" | "custom";

function CapabilityIcon({ kind }: { kind: CapabilityIconKind }) {
  const common = { viewBox: "0 0 24 24", className: "size-4.5", fill: "none", stroke: "currentColor", strokeWidth: 1.6 } as const;
  if (kind === "research") return <svg aria-hidden="true" {...common}><circle cx="10.5" cy="10.5" r="6" /><path d="m19 19-4.3-4.3" strokeLinecap="round" /></svg>;
  if (kind === "data") return <svg aria-hidden="true" {...common}><path d="M5 19V9m7 10V5m7 14v-7" strokeLinecap="round" /><path d="M3.5 19.5h17" strokeLinecap="round" /></svg>;
  if (kind === "content") return <svg aria-hidden="true" {...common}><path d="M6 19.5 4 20l.5-2 11-11 2 2Z" strokeLinejoin="round" /><path d="m14 6.5 2-2 2 2-2 2Z" strokeLinejoin="round" /></svg>;
  if (kind === "strategy") return <svg aria-hidden="true" {...common}><path d="M12 4.5a5 5 0 0 0-3 9v1.5h6V13.5a5 5 0 0 0-3-9Z" /><path d="M9.5 18h5M10.5 20.5h3" strokeLinecap="round" /></svg>;
  if (kind === "automation") return <svg aria-hidden="true" {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2.5" strokeLinecap="round" /></svg>;
  return <svg aria-hidden="true" {...common}><path d="M6 18 18 6M6 18l1-3.5L15.5 5.5 18.5 8.5 9.5 17Z" strokeLinejoin="round" /><path d="M17 3.5l.6 1.4L19 5.5l-1.4.6-.6 1.4-.6-1.4L15 5.5l1.4-.6Z" strokeLinejoin="round" /></svg>;
}

const CAPABILITY_LINKS = [
  { label: "Research & Insights", description: "Deep dive and synthesize", href: "/agents?category=research", icon: "research" },
  { label: "Data Analysis", description: "Analyze, visualize, predict", href: "/tools?category=data", icon: "data" },
  { label: "Content Creation", description: "Write, edit, summarize", href: "/agents?category=content", icon: "content" },
  { label: "Strategy & Planning", description: "Plans, roadmaps, OKRs", href: "/agents", icon: "strategy" },
  { label: "Automation", description: "Workflows, integrations", href: "/automations", icon: "automation" },
  { label: "Custom Task", description: "Describe any task", href: "/agents?category=mine", icon: "custom" },
] as const satisfies readonly { label: string; description: string; href: string; icon: CapabilityIconKind }[];

function AgentCapabilityRail() {
  return (
    <nav aria-label="Возможности Lumenza" className="agent-capability-rail">
      {CAPABILITY_LINKS.map((item) => (
        <Link key={item.label} href={item.href}>
          <span aria-hidden="true" className="agent-capability-icon"><CapabilityIcon kind={item.icon} /></span>
          <span className="min-w-0">
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
        </Link>
      ))}
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
  const [archiveTarget, setArchiveTarget] = useState<CustomAgentSummary | null>(null);
  const [archiving, setArchiving] = useState(false);

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

  async function confirmArchive() {
    if (!archiveTarget) return;
    const slug = archiveTarget.slug;
    setArchiving(true);
    try {
      await api.archiveCustomAgent(slug);
      setMyAgents((prev) => prev?.filter((agent) => agent.slug !== slug) ?? prev);
      setArchiveTarget(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось архивировать агента."));
    } finally {
      setArchiving(false);
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
            <div className="flex flex-col gap-3">
              {(Object.keys(CATEGORY_LABELS) as AgentCategory[]).map((category) => {
                const agentsInCategory = catalog.filter((agent) => agent.category === category);
                if (agentsInCategory.length === 0) return null;
                return (
                  <div key={category}>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                      {CATEGORY_LABELS[category]}
                    </p>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      {agentsInCategory.map((agent) => (
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
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Название"
            aria-label="Название"
            className="input"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Описание (необязательно)"
            aria-label="Описание (необязательно)"
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
                onClick={() => setArchiveTarget(agent)}
                className="shrink-0 text-xs text-muted underline hover:text-danger"
              >
                Архивировать
              </button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={archiveTarget !== null}
        title={`Архивировать «${archiveTarget?.name ?? ""}»?`}
        description="Агент исчезнет из списка «Мои агенты». Это действие можно расценивать как удаление — восстановить агента из интерфейса будет нельзя."
        confirmLabel="Архивировать"
        pendingLabel="Архивируем…"
        pending={archiving}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

const MIN_SWARM_SIZE = 2;
const MAX_SWARM_SIZE = 5;
const SWARM_POLL_INTERVAL_MS = 2000;
const SWARM_IN_PROGRESS = new Set<SwarmRun["status"]>(["pending", "processing"]);

// "Рой агентов" — запускает один выбранный агент параллельно на 2-5
// вариантах входных данных (agents.services.start_swarm_run/
// agents.tasks.synthesize_swarm), затем показывает объединённый отчёт.
// Работает с ЛЮБЫМ уже опубликованным агентом каталога, а не с отдельным
// "агентом для роя" — тот же принцип переиспользования, что и у "Мои
// агенты".
function SwarmBuilder({ catalog }: { catalog: AgentSummary[] | null }) {
  const [selectedSlug, setSelectedSlug] = useState("");
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([{}, {}]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swarmRun, setSwarmRun] = useState<SwarmRun | null>(null);

  useEffect(() => {
    if (!selectedSlug) return;
    let cancelled = false;
    api.agent(selectedSlug).then(
      (data) => {
        if (cancelled) return;
        setAgentDetail(data);
        setRows([{}, {}]);
      },
      (requestError) => {
        if (!cancelled) setError(apiErrorMessage(requestError, "Не удалось загрузить агента."));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selectedSlug]);

  function selectAgent(slug: string) {
    setSelectedSlug(slug);
    if (!slug) setAgentDetail(null);
  }

  useEffect(() => {
    if (!swarmRun || !SWARM_IN_PROGRESS.has(swarmRun.status)) return;
    let cancelled = false;
    const timer = setInterval(() => {
      api.swarmRun(swarmRun.id).then((updated) => {
        if (!cancelled) setSwarmRun(updated);
      });
    }, SWARM_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [swarmRun]);

  function updateRowField(rowIndex: number, key: string, value: string) {
    setRows((previous) =>
      previous.map((row, index) => (index === rowIndex ? { ...row, [key]: value } : row)),
    );
  }

  function addRow() {
    setRows((previous) => (previous.length >= MAX_SWARM_SIZE ? previous : [...previous, {}]));
  }

  function removeRow(rowIndex: number) {
    setRows((previous) =>
      previous.length <= MIN_SWARM_SIZE
        ? previous
        : previous.filter((_, index) => index !== rowIndex),
    );
  }

  async function submit() {
    if (!agentDetail || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setSwarmRun(await api.createSwarmRun(agentDetail.slug, rows));
    } catch (requestError) {
      setError(apiErrorMessage(requestError, "Не удалось запустить рой агентов."));
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setSwarmRun(null);
    setError(null);
  }

  const requiredFilled =
    !!agentDetail &&
    rows.every((row) =>
      agentDetail.input_schema.fields.every(
        (field) => !field.required || (row[field.key] ?? "").trim().length > 0,
      ),
    );

  return (
    <div className="mt-6">
      <p className="text-sm text-muted">
        Запустите один агент параллельно на нескольких вариантах входных данных — Lumenza объединит
        результаты в один общий отчёт.
      </p>

      {!swarmRun ? (
        <div className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted">Агент</span>
            <select
              aria-label="Выберите агента для роя"
              value={selectedSlug}
              onChange={(event) => selectAgent(event.target.value)}
              className="input"
            >
              <option value="">Выберите агента</option>
              {(catalog ?? []).map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          {agentDetail && (
            <div className="flex flex-col gap-3">
              {rows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">
                      Вариант {rowIndex + 1}
                    </span>
                    {rows.length > MIN_SWARM_SIZE && (
                      <button
                        type="button"
                        onClick={() => removeRow(rowIndex)}
                        className="text-xs text-danger underline"
                      >
                        Убрать
                      </button>
                    )}
                  </div>
                  {agentDetail.input_schema.fields.map((field) => (
                    <label key={field.key} className="flex flex-col gap-1 text-sm">
                      <span className="text-muted">{field.label}</span>
                      {field.type === "select" ? (
                        <select
                          value={row[field.key] ?? ""}
                          onChange={(event) =>
                            updateRowField(rowIndex, field.key, event.target.value)
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
                          value={row[field.key] ?? ""}
                          maxLength={field.max_length}
                          onChange={(event) =>
                            updateRowField(rowIndex, field.key, event.target.value)
                          }
                          className="input"
                        />
                      )}
                    </label>
                  ))}
                </div>
              ))}

              {rows.length < MAX_SWARM_SIZE && (
                <button type="button" onClick={addRow} className="btn-secondary self-start">
                  + Добавить вариант
                </button>
              )}

              {error && (
                <p role="alert" className="text-sm text-danger">
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting || !requiredFilled}
                className="btn-primary self-end"
              >
                {submitting ? "Запускаем…" : "Запустить рой"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <ol className="flex flex-col gap-2">
            {swarmRun.children.map((child, index) => (
              <li
                key={child.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="text-ink">Вариант {index + 1}</span>
                <span className={`status-pill ${statusPillClass(child.status)}`} aria-live="polite">
                  {child.status}
                </span>
              </li>
            ))}
          </ol>

          {(swarmRun.status === "error" || swarmRun.status === "insufficient_credits") && (
            <p role="alert" className="text-sm text-danger">
              {swarmRun.error_message || "Не удалось выполнить рой агентов."}
            </p>
          )}

          {swarmRun.status === "ok" && swarmRun.result && (
            <div className="rounded-md border border-border bg-surface p-4">
              <h2 className="text-sm font-medium text-ink">Общий отчёт</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {swarmRun.result.combined_summary}
              </p>
            </div>
          )}

          {!SWARM_IN_PROGRESS.has(swarmRun.status) && (
            <button type="button" onClick={startOver} className="btn-secondary self-start">
              Запустить снова
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function parseCategory(value: string | null): CategoryFilter | null {
  return value === "content"
    || value === "research"
    || value === "documents"
    || value === "finance"
    || value === "code"
    || value === "video"
    || value === "audio"
    || value === "mine"
    || value === "swarm"
    ? value
    : null;
}
