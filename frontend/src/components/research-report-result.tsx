import type { ResearchReportResult as ResearchReportResultData } from "@/lib/api";

export function ResearchReportResult({ data }: { data: ResearchReportResultData }) {
  return (
    <div className="flex flex-col gap-6">
      {data.title && (
        <h2 className="text-lg font-semibold tracking-tight text-ink">{data.title}</h2>
      )}

      {data.sections.length > 0 && (
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
      )}

      {data.key_takeaways.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Ключевые выводы
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {data.key_takeaways.map((point, index) => (
              <li key={index} className="text-sm text-ink">
                {point}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
