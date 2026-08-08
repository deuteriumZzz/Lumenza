import type { PitchDeckBuilderResult as PitchDeckBuilderResultData } from "@/lib/api";

export function PitchDeckBuilderResult({ data }: { data: PitchDeckBuilderResultData }) {
  return (
    <div className="flex flex-col gap-4">
      {data.title && <h2 className="text-sm font-medium text-ink">{data.title}</h2>}
      {data.pptx_url && (
        <a
          href={data.pptx_url}
          download
          className="btn-secondary self-start"
        >
          Скачать презентацию (.pptx)
        </a>
      )}
      {data.summary && (
        <p className="text-sm leading-relaxed text-ink">{data.summary}</p>
      )}
    </div>
  );
}
