import type { MarketResearchResult as MarketResearchResultData } from "@/lib/api";

export function MarketResearchResult({ data }: { data: MarketResearchResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.trends.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Тренды</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.trends.map((trend, index) => (
              <li key={index} className="text-sm text-ink">
                {trend}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.key_players.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Ключевые игроки
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.key_players.map((player, index) => (
              <li key={index} className="text-sm text-ink">
                {player}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.sources_note && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Источники
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{data.sources_note}</p>
        </section>
      )}

      {data.disclaimer && (
        <p role="note" className="rounded-md border border-border bg-surface p-3 text-xs text-muted">
          {data.disclaimer}
        </p>
      )}
    </div>
  );
}
