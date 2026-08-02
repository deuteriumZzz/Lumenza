import type { BlogPostGeneratorResult as BlogPostGeneratorResultData } from "@/lib/api";

export function BlogPostGeneratorResult({ data }: { data: BlogPostGeneratorResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{data.title}</h2>

      <div className="flex flex-col gap-4">
        {data.sections.map((section, index) => (
          <section key={index}>
            <h3 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
              {section.heading}
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {section.body}
            </p>
          </section>
        ))}
      </div>

      {data.summary && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Резюме</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
        </section>
      )}
    </div>
  );
}
