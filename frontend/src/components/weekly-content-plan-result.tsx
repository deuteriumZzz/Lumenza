import type { WeeklyContentPlanResult as WeeklyContentPlanResultData } from "@/lib/api";

export function WeeklyContentPlanResult({ data }: { data: WeeklyContentPlanResultData }) {
  return (
    <div className="flex flex-col gap-3">
      {data.days.map((day, index) => (
        <div key={index} className="rounded-md border border-border bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{day.day_label}</p>
            <span className="text-xs text-muted">{day.platform}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink">{day.post_text}</p>
          {day.hashtags.length > 0 && (
            <p className="mt-2 text-xs text-muted">{day.hashtags.join(" ")}</p>
          )}
        </div>
      ))}
    </div>
  );
}
