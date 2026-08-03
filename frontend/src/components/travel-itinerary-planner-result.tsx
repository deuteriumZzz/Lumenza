import type { TravelItineraryPlannerResult as TravelItineraryPlannerResultData } from "@/lib/api";

export function TravelItineraryPlannerResult({ data }: { data: TravelItineraryPlannerResultData }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-ink">{data.destination}</h2>

      <div className="flex flex-col gap-3">
        {data.itinerary.map((day, index) => (
          <div key={index} className="rounded-md border border-border bg-surface p-3">
            <p className="text-sm font-medium text-ink">{day.day_label}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {day.activities.map((activity, activityIndex) => (
                <li key={activityIndex} className="text-sm text-ink">
                  {activity}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {data.budget_note && (
        <p className="text-sm text-muted">{data.budget_note}</p>
      )}
    </div>
  );
}
