import type { RfpResponseDrafterResult as RfpResponseDrafterResultData } from "@/lib/api";

export function RfpResponseDrafterResult({ data }: { data: RfpResponseDrafterResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.responses.length > 0 && (
        <div className="flex flex-col gap-3">
          {data.responses.map((item, index) => (
            <div key={index} className="rounded-md border border-border bg-surface p-3">
              <p className="text-sm font-medium text-ink">{item.question}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.answer}</p>
            </div>
          ))}
        </div>
      )}

      {data.summary && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Резюме</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
        </section>
      )}
    </div>
  );
}
