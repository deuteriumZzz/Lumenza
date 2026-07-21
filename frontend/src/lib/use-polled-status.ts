import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 2000;
// Разовый сетевой сбой не должен останавливать опрос, но опрос, который
// продолжает падать бесконечно (обрыв соединения, бэкенд недоступен),
// иначе повторялся бы молча и вечно без обратной связи — останавливаем и
// показываем ошибку после стольких подряд неудач.
const MAX_CONSECUTIVE_POLL_FAILURES = 5;

// Опрашивает одну запись асинхронной задачи (транскрипция/речь/документ/
// фото), пока её статус не выйдет из inProgressStatuses. Общая для каждой
// страницы, которая создаёт одну из таких задач и показывает её живой
// статус — см. страницы voice/documents/analyze.
export function usePolledStatus<T extends { id: number; status: string }>(
  entry: T | null,
  inProgressStatuses: ReadonlySet<string>,
  fetchStatus: (id: number) => Promise<T>,
  onUpdate: (updated: T) => void,
  onStalled: () => void
) {
  // Колбэки хранятся в ref (а не как зависимости эффекта), чтобы вызывающий
  // код, передающий свежую инлайновую стрелочную функцию на каждом рендере,
  // не разрушал и не перезапускал интервал на каждом рендере — на это
  // должно реагировать только реальное изменение `entry` (новая задача, или
  // обновление её статуса/полей). Ref обновляются из эффекта (не во время
  // рендера), как того требуют правила хуков.
  const onUpdateRef = useRef(onUpdate);
  const onStalledRef = useRef(onStalled);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
    onStalledRef.current = onStalled;
  });

  useEffect(() => {
    if (!entry || !inProgressStatuses.has(entry.status)) return;
    let consecutiveFailures = 0;
    const timer = setInterval(() => {
      fetchStatus(entry.id)
        .then((updated) => {
          consecutiveFailures = 0;
          onUpdateRef.current(updated);
        })
        .catch(() => {
          consecutiveFailures += 1;
          if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
            clearInterval(timer);
            onStalledRef.current();
          }
        });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [entry, inProgressStatuses, fetchStatus]);
}
