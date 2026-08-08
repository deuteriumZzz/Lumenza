import type { AudioAdCreatorResult as AudioAdCreatorResultData } from "@/lib/api";

export function AudioAdCreatorResult({ data }: { data: AudioAdCreatorResultData }) {
  return (
    <div className="flex flex-col gap-4">
      {data.audio_url && (
        <audio controls src={data.audio_url} className="w-full max-w-md" />
      )}
      {data.script && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Сценарий</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink">{data.script}</p>
        </section>
      )}
      {data.caption && (
        <p className="text-sm text-muted">{data.caption}</p>
      )}
    </div>
  );
}
