// Общее правило для всех статусов задач (chat/images/analyze/documents/
// voice/history): "ok" — успех, "error" — ошибка, всё остальное (pending,
// processing, insufficient_credits, blocked, task_locked, model_locked) —
// нейтральный/промежуточный вид. Человекочитаемые подписи для отдельных
// статусов (например, "task locked") остаются на стороне вызывающего кода,
// где они уже специфичны для конкретной страницы.
export function statusPillClass(status: string): string {
  if (status === "ok") return "bg-success";
  if (status === "error") return "bg-danger";
  return "bg-surface-raised text-muted";
}
