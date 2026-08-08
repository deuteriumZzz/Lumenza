import type { ContractAnalyzerResult as ContractAnalyzerResultData } from "@/lib/api";

export function ContractAnalyzerResult({ data }: { data: ContractAnalyzerResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.summary && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Саммари</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
        </section>
      )}

      {data.key_terms.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Ключевые условия
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.key_terms.map((term, index) => (
              <li key={index} className="text-sm text-ink">
                {term}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.risks.length > 0 && (
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
      )}

      {data.recommendations.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Рекомендации
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.recommendations.map((rec, index) => (
              <li key={index} className="text-sm text-ink">
                {rec}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p role="note" className="rounded-md border border-border bg-surface p-3 text-xs text-muted">
        Не является юридической консультацией.
      </p>
    </div>
  );
}
