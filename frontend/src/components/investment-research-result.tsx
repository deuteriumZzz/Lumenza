import type { InvestmentResearchResult as InvestmentResearchResultData } from "@/lib/api";

export function InvestmentResearchResult({ data }: { data: InvestmentResearchResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Тезис</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{data.thesis}</p>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Риски</h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.risks.map((risk, index) => (
            <li key={index} className="text-sm text-ink">
              {risk}
            </li>
          ))}
        </ul>
      </section>

      {data.sources_note && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Источники
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{data.sources_note}</p>
        </section>
      )}

      <p role="note" className="rounded-md border border-border bg-surface p-3 text-xs text-muted">
        {data.disclaimer}
      </p>
    </div>
  );
}
