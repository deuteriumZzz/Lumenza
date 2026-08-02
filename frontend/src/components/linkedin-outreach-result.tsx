import type { LinkedinOutreachResult as LinkedinOutreachResultData } from "@/lib/api";

export function LinkedinOutreachResult({ data }: { data: LinkedinOutreachResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Варианты первой строки
        </h2>
        <ul className="mt-3 flex flex-col gap-1">
          {data.opening_lines.map((line, index) => (
            <li key={index} className="text-sm text-ink">
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Сообщение</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{data.message}</p>
      </section>

      {data.follow_up && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Follow-up</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.follow_up}</p>
        </section>
      )}
    </div>
  );
}
