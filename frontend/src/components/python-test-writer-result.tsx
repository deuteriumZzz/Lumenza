import type { PythonTestWriterResult as PythonTestWriterResultData } from "@/lib/api";

export function PythonTestWriterResult({ data }: { data: PythonTestWriterResultData }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Резюме</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink">{data.summary}</p>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Результат запуска
        </h2>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-mono text-xs text-ink">
          {data.code_stdout}
        </pre>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Код с тестами
        </h2>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-surface p-3 font-mono text-xs text-ink">
          {data.test_code}
        </pre>
      </section>
    </div>
  );
}
