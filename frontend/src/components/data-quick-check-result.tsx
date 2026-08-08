import type { DataQuickCheckResult as DataQuickCheckResultData } from "@/lib/api";

export function DataQuickCheckResult({ data }: { data: DataQuickCheckResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.code_stdout && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Вывод скрипта
          </h2>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-mono text-xs text-ink">
            {data.code_stdout}
          </pre>
        </section>
      )}

      {data.explanation && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Объяснение
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.explanation}</p>
        </section>
      )}
    </div>
  );
}
