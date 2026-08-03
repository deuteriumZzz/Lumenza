import type { ReviewSentimentClassifierResult as ReviewSentimentClassifierResultData } from "@/lib/api";

export function ReviewSentimentClassifierResult({ data }: { data: ReviewSentimentClassifierResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Отзывы</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {data.classified_reviews.map((review, index) => (
            <li key={index} className="rounded-md border border-border bg-surface p-3 text-sm text-ink">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted">
                <span>{review.sentiment}</span>
                <span>·</span>
                <span>Срочность: {review.urgency}</span>
              </div>
              <p className="mt-2">{review.review_snippet}</p>
              {review.reason && <p className="mt-1 text-xs text-muted">{review.reason}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Общий вывод</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{data.overall_summary}</p>
      </section>
    </div>
  );
}
