import type { TwitterContentEngineResult as TwitterContentEngineResultData } from "@/lib/api";

export function TwitterContentEngineResult({ data }: { data: TwitterContentEngineResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.trending_topics.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Актуальные темы
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.trending_topics.map((topic, index) => (
              <li key={index} className="text-sm text-ink">
                {topic}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.tweets.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Твиты</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {data.tweets.map((tweet, index) => (
              <li key={index} className="rounded-md border border-border bg-surface p-3 text-sm text-ink">
                {tweet}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.thread_idea && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Идея для треда
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.thread_idea}</p>
        </section>
      )}
    </div>
  );
}
