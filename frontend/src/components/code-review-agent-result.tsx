import type { CodeReviewAgentResult as CodeReviewAgentResultData } from "@/lib/api";

export function CodeReviewAgentResult({ data }: { data: CodeReviewAgentResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Резюме</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Проблемы</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {data.issues.map((issue, index) => (
            <li key={index} className="rounded-md border border-border bg-surface p-3 text-sm text-ink">
              <span className="mr-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">
                {issue.severity}
              </span>
              {issue.description}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Предложения
        </h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.suggestions.map((suggestion, index) => (
            <li key={index} className="text-sm text-ink">
              {suggestion}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
