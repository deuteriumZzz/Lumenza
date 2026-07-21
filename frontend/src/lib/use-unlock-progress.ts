"use client";

import { useEffect, useRef, useState } from "react";
import { api, type Progress, type TaskOrImageTask } from "@/lib/api";

// Общая для chat и images логика прогресса разблокировок: обе страницы
// показывают один и тот же набор кнопок "заблокировано/доступно" поверх
// разных наборов задач (Task и ImageTask соответственно, оба — подмножества
// TaskOrImageTask).
export function useUnlockProgress() {
  // null во время загрузки — каждая задача рендерится разблокированной, а
  // не мигает как заблокированная на мгновение при первой отрисовке.
  const [progress, setProgress] = useState<Progress | null>(null);
  // Ключи, которые стали unlocked между предыдущим и текущим refresh —
  // повод показать toast. Пусто при самой первой загрузке страницы: тогда
  // ещё не с чем сравнивать, и всё, что уже открыто, не новость.
  const [justUnlocked, setJustUnlocked] = useState<TaskOrImageTask[]>([]);
  const previousUnlockedRef = useRef<Set<TaskOrImageTask> | null>(null);

  async function refreshProgress() {
    try {
      const next = await api.progress();
      if (previousUnlockedRef.current) {
        const newly = next.unlocked.filter(
          (key) => !previousUnlockedRef.current!.has(key)
        );
        if (newly.length > 0) {
          setJustUnlocked((prev) => [...prev, ...newly]);
        }
      }
      previousUnlockedRef.current = new Set(next.unlocked);
      setProgress(next);
    } catch {
      // Некритично: страница всё равно работает без UI блокировок/прогресса.
    }
  }

  useEffect(() => {
    api.progress().then((next) => {
      previousUnlockedRef.current = new Set(next.unlocked);
      setProgress(next);
    }).catch(() => {});
  }, []);

  function dismissUnlock(key: TaskOrImageTask) {
    setJustUnlocked((prev) => prev.filter((k) => k !== key));
  }

  const isUnlocked = (value: TaskOrImageTask) =>
    !progress || progress.tier === "paid" || progress.unlocked.includes(value);
  const progressFor = (value: TaskOrImageTask) => progress?.progress.find((p) => p.key === value);

  return { progress, refreshProgress, isUnlocked, progressFor, justUnlocked, dismissUnlock };
}
