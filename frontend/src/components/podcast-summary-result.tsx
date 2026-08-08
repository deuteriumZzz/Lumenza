import type { PodcastSummaryResult as PodcastSummaryResultData } from "@/lib/api";

export function PodcastSummaryResult({ data }: { data: PodcastSummaryResultData }) {
  return (
    <div className="flex flex-col gap-4">
      {data.title && <h2 className="text-sm font-medium text-ink">{data.title}</h2>}
      {data.audio_url && (
        <audio controls src={data.audio_url} className="w-full max-w-md" />
      )}
      {data.description && (
        <p className="text-sm leading-relaxed text-ink">{data.description}</p>
      )}
    </div>
  );
}
