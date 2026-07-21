"use client";

import { useEffect } from "react";
import type { TaskOrImageTask } from "@/lib/api";

interface UnlockToastsProps {
  unlockedKeys: TaskOrImageTask[];
  labelFor: (key: TaskOrImageTask) => string;
  onDismiss: (key: TaskOrImageTask) => void;
}

const AUTO_DISMISS_MS = 5000;

// Общий для chat и images стек toast-уведомлений о свежих разблокировках —
// сам список "что только что открылось" приходит из useUnlockProgress.
export function UnlockToasts({ unlockedKeys, labelFor, onDismiss }: UnlockToastsProps) {
  if (unlockedKeys.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-30 flex flex-col gap-2"
      aria-live="polite"
    >
      {unlockedKeys.map((key) => (
        <UnlockToast key={key} unlockKey={key} label={labelFor(key)} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function UnlockToast({
  unlockKey,
  label,
  onDismiss,
}: {
  unlockKey: TaskOrImageTask;
  label: string;
  onDismiss: (key: TaskOrImageTask) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(unlockKey), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [unlockKey, onDismiss]);

  return (
    <div
      role="status"
      className="toast pointer-events-auto flex items-center gap-2 rounded-md border border-primary/40 bg-surface-raised px-4 py-3 text-sm text-ink shadow-lg"
    >
      <span aria-hidden="true">🎉</span>
      <span>
        <strong className="font-semibold">{label}</strong> unlocked!
      </span>
      <button
        type="button"
        onClick={() => onDismiss(unlockKey)}
        className="ml-2 text-muted transition-colors duration-150 hover:text-ink"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
