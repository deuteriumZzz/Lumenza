import type { DocumentTranslationResult as DocumentTranslationResultData } from "@/lib/api";

export function DocumentTranslationResult({ data }: { data: DocumentTranslationResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Перевод</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {data.translated_text}
        </p>
      </section>

      {data.summary && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Саммари</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
        </section>
      )}
    </div>
  );
}
