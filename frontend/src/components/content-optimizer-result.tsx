import type { ContentOptimizerResult as ContentOptimizerResultData } from "@/lib/api";

export function ContentOptimizerResult({ data }: { data: ContentOptimizerResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.variants.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Варианты</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {data.variants.map((variant, index) => (
              <li key={index} className="rounded-md border border-border bg-surface p-3 text-sm text-ink">
                {variant}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.hooks.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Альтернативные хуки
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.hooks.map((hook, index) => (
              <li key={index} className="text-sm text-ink">
                {hook}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.feedback && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Обратная связь
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.feedback}</p>
        </section>
      )}
    </div>
  );
}
