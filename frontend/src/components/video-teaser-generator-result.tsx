import type { VideoTeaserGeneratorResult as VideoTeaserGeneratorResultData } from "@/lib/api";

export function VideoTeaserGeneratorResult({ data }: { data: VideoTeaserGeneratorResultData }) {
  // Mocked generations (no REPLICATE_API_TOKEN) are saved as an animated
  // GIF, not a real MP4 — see videogen/mock.py and
  // agents.tasks._run_video_generation_step's extension choice. Browsers
  // can't decode a GIF via <video>, so branch on the extension.
  const isGif = data.video_url?.endsWith(".gif");

  return (
    <div className="flex flex-col gap-4">
      {data.video_url && isGif ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={data.video_url}
          alt={data.caption || "Сгенерированное видео (заглушка)"}
          width={1280}
          height={720}
          className="w-full max-w-md rounded-md border border-border"
        />
      ) : data.video_url ? (
        <video
          controls
          src={data.video_url}
          className="w-full max-w-md rounded-md border border-border"
        />
      ) : null}
      {data.caption && (
        <p className="text-sm leading-relaxed text-ink">{data.caption}</p>
      )}
    </div>
  );
}
