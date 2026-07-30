"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { GoalCard } from "@/components/goal-card";
import { springs } from "@/lib/motion";
import { api, apiErrorMessage, type AgentCategory, type AgentSummary } from "@/lib/api";

type CategoryFilter = "all" | AgentCategory;

// "Популярное" всегда первая и показывает весь каталог без фильтра — только
// категории с хотя бы одним реально работающим агентом получают свою
// вкладку (см. SPEC.md Phase 16: без вкладок-заглушек без фичи за ними).
const CATEGORIES: { key: CategoryFilter; label: string }[] = [
  { key: "all", label: "Популярное" },
  { key: "content", label: "Контент" },
  { key: "research", label: "Исследования" },
  { key: "documents", label: "Документы" },
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
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-8 min-[380px]:px-4 sm:px-6 sm:py-12">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Агенты</h1>
      <p className="mt-1 text-sm text-muted">
        Готовые сценарии: отвечаете на несколько вопросов — получаете структурированный результат.
      </p>

      <nav
        aria-label="Категория агентов"
        data-testid="agents-category-navigation"
        className="mt-6 flex flex-wrap items-center gap-1 min-[380px]:gap-2"
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
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
    </div>
  );
}

function parseCategory(value: string | null): AgentCategory | null {
  return value === "content" || value === "research" || value === "documents" ? value : null;
}
