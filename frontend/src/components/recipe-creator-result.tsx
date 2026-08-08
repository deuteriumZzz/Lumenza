import type { RecipeCreatorResult as RecipeCreatorResultData } from "@/lib/api";

export function RecipeCreatorResult({ data }: { data: RecipeCreatorResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {(data.title || data.intro_text) && (
        <div>
          {data.title && (
            <h2 className="text-lg font-semibold tracking-tight text-ink">{data.title}</h2>
          )}
          {data.intro_text && <p className="mt-2 text-sm leading-relaxed text-muted">{data.intro_text}</p>}
        </div>
      )}

      {data.ingredients.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Ингредиенты</h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.ingredients.map((item, index) => (
              <li key={index} className="text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.steps.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Шаги</h2>
          <ol className="mt-3 flex flex-col gap-1 list-decimal pl-4">
            {data.steps.map((step, index) => (
              <li key={index} className="text-sm text-ink">
                {step}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
