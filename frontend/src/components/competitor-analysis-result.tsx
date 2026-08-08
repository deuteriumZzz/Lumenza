import type { CompetitorAnalysisResult as CompetitorAnalysisResultData } from "@/lib/api";

export function CompetitorAnalysisResult({ data }: { data: CompetitorAnalysisResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.strengths.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Сильные стороны
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.strengths.map((item, index) => (
              <li key={index} className="text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.weaknesses.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Слабые стороны
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.weaknesses.map((item, index) => (
              <li key={index} className="text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.opportunities.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Возможности
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.opportunities.map((item, index) => (
              <li key={index} className="text-sm text-ink">
                {item}
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
