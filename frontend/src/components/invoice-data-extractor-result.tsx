import type { InvoiceDataExtractorResult as InvoiceDataExtractorResultData } from "@/lib/api";

export function InvoiceDataExtractorResult({ data }: { data: InvoiceDataExtractorResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Поставщик</dt>
          <dd className="mt-1 text-sm text-ink">{data.vendor}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Сумма</dt>
          <dd className="mt-1 text-sm text-ink">{data.amount}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Срок оплаты</dt>
          <dd className="mt-1 text-sm text-ink">{data.due_date}</dd>
        </div>
      </dl>

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
    </div>
  );
}
