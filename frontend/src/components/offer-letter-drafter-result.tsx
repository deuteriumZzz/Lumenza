import type { OfferLetterDrafterResult as OfferLetterDrafterResultData } from "@/lib/api";

export function OfferLetterDrafterResult({ data }: { data: OfferLetterDrafterResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Письмо</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {data.offer_letter_text}
        </p>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Ключевые условия
        </h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.key_terms.map((term, index) => (
            <li key={index} className="text-sm text-ink">
              {term}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
