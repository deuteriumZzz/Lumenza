import type { SupportReplyDrafterResult as SupportReplyDrafterResultData } from "@/lib/api";

export function SupportReplyDrafterResult({ data }: { data: SupportReplyDrafterResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.reply_text && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Ответ</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{data.reply_text}</p>
        </section>
      )}

      {data.tone_note && (
        <p role="note" className="rounded-md border border-border bg-surface p-3 text-xs text-muted">
          {data.tone_note}
        </p>
      )}
    </div>
  );
}
