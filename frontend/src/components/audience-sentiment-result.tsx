import type { AudienceSentimentResult as AudienceSentimentResultData } from "@/lib/api";

export function AudienceSentimentResult({ data }: { data: AudienceSentimentResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.overall_sentiment && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Общий тон
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.overall_sentiment}</p>
        </section>
      )}

      {data.themes.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Темы</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.themes.map((theme, index) => (
              <li key={index} className="text-sm text-ink">
                {theme}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.notable_mentions.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Заметные упоминания
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.notable_mentions.map((mention, index) => (
              <li key={index} className="text-sm text-ink">
                {mention}
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
    </div>
  );
}
