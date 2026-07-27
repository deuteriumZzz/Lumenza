"use client";

import { useEffect, useState } from "react";
import { GoalCard } from "@/components/goal-card";
import { api, apiErrorMessage, type AgentSummary } from "@/lib/api";

const THREADS_AGENT_SLUG = "threads-content-day";

export default function HomePage() {
  const [agent, setAgent] = useState<AgentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.agent(THREADS_AGENT_SLUG).then(
      (data) => {
        if (!cancelled) setAgent(data);
      },
      (err) => {
        if (!cancelled) setError(apiErrorMessage(err, "Не удалось загрузить агента."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-3 py-8 min-[380px]:px-4 sm:px-6 sm:py-12">
      <h1 className="text-xl font-semibold tracking-tight text-ink">С чего начнём?</h1>
      <p className="mt-1 text-sm text-muted">Выберите режим — под вашу текущую задачу.</p>

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <GoalCard
          index={0}
          href="/chat"
          title="Чат"
          description="Прямой диалог с моделью — авто-подбор или выбор вручную."
        />
        <GoalCard
          index={1}
          href={`/agents/${agent?.slug ?? THREADS_AGENT_SLUG}`}
          title={agent?.name ?? "Контент на день для Threads"}
          description={
            agent?.description ??
            "Соберёт тему, аудиторию, тон и цель — выдаст готовый план Threads на день."
          }
          caption="1 агент"
        />
        <GoalCard
          index={2}
          href="/studio"
          title="Студия"
          description="Картинки, голос, документы, анализ фото."
        />
      </div>
    </div>
  );
}
