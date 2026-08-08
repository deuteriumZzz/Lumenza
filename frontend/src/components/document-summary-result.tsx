import type { DocumentSummaryResult as DocumentSummaryResultData } from "@/lib/api";

export function DocumentSummaryResult({ data }: { data: DocumentSummaryResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.summary && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Саммари</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
        </section>
      )}

      {data.key_points.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Ключевые пункты
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.key_points.map((point, index) => (
              <li key={index} className="text-sm text-ink">
                {point}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.answer && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Ответ</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.answer}</p>
        </section>
      )}
    </div>
  );
}
