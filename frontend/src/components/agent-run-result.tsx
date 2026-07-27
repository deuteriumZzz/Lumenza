import type { ThreadsContentPlan } from "@/lib/api";

// The result is strictly-typed JSON (branches/hooks/schedule/variants), not
// freeform prose from a chat turn — a sectioned renderer here delivers a
// genuinely structured result, whereas markdown-response.tsx (built for
// chat-bubble prose) would just flatten it back into text.
export function AgentRunResult({ plan }: { plan: ThreadsContentPlan }) {
  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
          Ветки контента
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {plan.branches.map((branch) => (
            <li key={branch.title} className="rounded-md border border-border bg-surface p-3">
              <p className="text-sm font-medium text-ink">{branch.title}</p>
              <p className="mt-1 text-sm text-muted">{branch.angle}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Хуки</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {plan.hooks.map((hook) => (
            <li key={hook.branch}>
              <p className="text-sm font-medium text-ink">{hook.branch}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {hook.variants.map((variant, index) => (
                  <li key={index} className="text-sm text-muted">
                    {variant}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">Расписание</h2>
        <div className="mt-3 overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Время</th>
                <th className="px-3 py-2 font-medium">Ветка</th>
                <th className="px-3 py-2 font-medium">Текст поста</th>
              </tr>
            </thead>
            <tbody>
              {plan.schedule.map((row, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">
                    {row.time}
                  </td>
                  <td className="px-3 py-2 text-ink">{row.branch}</td>
                  <td className="px-3 py-2 text-muted">{row.post_text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {plan.variants.length > 0 && (
        <section>
          <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
            Другие варианты
          </h2>
          <ul className="mt-3 flex flex-col gap-1">
            {plan.variants.map((variant, index) => (
              <li key={index} className="text-sm text-muted">
                {variant}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
