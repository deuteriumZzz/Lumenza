import type { InvoiceDataExtractorResult as InvoiceDataExtractorResultData } from "@/lib/api";

export function InvoiceDataExtractorResult({ data }: { data: InvoiceDataExtractorResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {(data.vendor || data.amount || data.due_date) && (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {data.vendor && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Поставщик</dt>
              <dd className="mt-1 text-sm text-ink">{data.vendor}</dd>
            </div>
          )}
          {data.amount && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Сумма</dt>
              <dd className="mt-1 text-sm text-ink">{data.amount}</dd>
            </div>
          )}
          {data.due_date && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Срок оплаты</dt>
              <dd className="mt-1 text-sm text-ink">{data.due_date}</dd>
            </div>
          )}
        </dl>
      )}

      {data.line_items.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Позиции</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.line_items.map((item, index) => (
              <li key={index} className="text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
