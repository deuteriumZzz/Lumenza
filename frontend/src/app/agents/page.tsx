"use client";

import { useEffect, useState } from "react";
import { GoalCard } from "@/components/goal-card";
import { api, apiErrorMessage, type AgentSummary } from "@/lib/api";

export default function AgentsPage() {
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

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-8 min-[380px]:px-4 sm:px-6 sm:py-12">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Агенты</h1>
      <p className="mt-1 text-sm text-muted">
        Готовые сценарии: отвечаете на несколько вопросов — получаете структурированный результат.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      {!error && agents === null && (
        <p role="status" className="mt-10 text-sm text-muted">
          Загрузка…
        </p>
      )}

      {agents && agents.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {agents.map((agent, index) => (
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
    </div>
  );
}
