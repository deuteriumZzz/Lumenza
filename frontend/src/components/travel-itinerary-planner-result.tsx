import type { TravelItineraryPlannerResult as TravelItineraryPlannerResultData } from "@/lib/api";

export function TravelItineraryPlannerResult({ data }: { data: TravelItineraryPlannerResultData }) {
  return (
    <div className="flex flex-col gap-4">
      {data.destination && (
        <h2 className="text-sm font-medium text-ink">{data.destination}</h2>
      )}

      {data.itinerary.length > 0 && (
        <section aria-label="Маршрут по дням">
          <ol className="flex flex-col gap-3">
            {data.itinerary.map((day, index) => (
              <li key={index} className="rounded-md border border-border bg-surface p-3">
                <p className="text-sm font-medium text-ink">{day.day_label}</p>
                {day.activities.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1">
                    {day.activities.map((activity, activityIndex) => (
                      <li key={activityIndex} className="text-sm text-ink">
                        {activity}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.budget_note && (
        <p className="text-sm text-muted">{data.budget_note}</p>
      )}
    </div>
  );
}
