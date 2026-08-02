import type { FinancialReportAnalyzerResult as FinancialReportAnalyzerResultData } from "@/lib/api";

export function FinancialReportAnalyzerResult({ data }: { data: FinancialReportAnalyzerResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Саммари</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Ключевые показатели
        </h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.key_metrics.map((metric, index) => (
            <li key={index} className="text-sm text-ink">
              {metric}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Тревожные сигналы
        </h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.red_flags.map((flag, index) => (
            <li key={index} className="text-sm text-ink">
              {flag}
            </li>
          ))}
        </ul>
      </section>

      <p role="note" className="rounded-md border border-border bg-surface p-3 text-xs text-muted">
        {data.disclaimer}
      </p>
    </div>
  );
}
