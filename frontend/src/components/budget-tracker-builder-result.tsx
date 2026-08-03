import type { BudgetTrackerBuilderResult as BudgetTrackerBuilderResultData } from "@/lib/api";

export function BudgetTrackerBuilderResult({ data }: { data: BudgetTrackerBuilderResultData }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink">{data.sheet_title}</h2>
      {data.excel_url && (
        <a
          href={data.excel_url}
          download
          className="btn-secondary self-start"
        >
          Скачать таблицу (.xlsx)
        </a>
      )}
      {data.summary && (
        <p className="text-sm leading-relaxed text-ink">{data.summary}</p>
      )}
    </div>
  );
}
