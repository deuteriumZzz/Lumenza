import type { ResumeJobMatcherResult as ResumeJobMatcherResultData } from "@/lib/api";

export function ResumeJobMatcherResult({ data }: { data: ResumeJobMatcherResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Сильные стороны
        </h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.strengths.map((item, index) => (
            <li key={index} className="text-sm text-ink">
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Пробелы</h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.gaps.map((item, index) => (
            <li key={index} className="text-sm text-ink">
              {item}
            </li>
          ))}
        </ul>
      </section>

      {data.tailored_summary && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Резюме</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.tailored_summary}</p>
        </section>
      )}
    </div>
  );
}
