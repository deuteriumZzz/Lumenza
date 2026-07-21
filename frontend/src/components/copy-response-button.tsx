"use client";

import { useEffect, useRef, useState } from "react";

type CopyStatus = "idle" | "copying" | "copied" | "error";

const COPY_LABELS: Record<CopyStatus, { accessible: string; visible: string }> = {
  idle: { accessible: "Copy response", visible: "Copy" },
  copying: { accessible: "Copying response", visible: "Copying…" },
  copied: { accessible: "Response copied", visible: "Copied" },
  error: {
    accessible: "Could not copy response. Try again",
    visible: "Try again",
  },
};

export function CopyResponseButton({ text }: { text: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const mountedRef = useRef(true);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resetTimeoutRef.current !== null) {
        clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  function scheduleReset() {
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
    }
    resetTimeoutRef.current = setTimeout(() => {
      resetTimeoutRef.current = null;
      setStatus("idle");
    }, 2000);
  }

  async function copyResponse() {
    if (status === "copying") return;

    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API is unavailable");
      }
      await navigator.clipboard.writeText(text);
      if (!mountedRef.current) return;
      setStatus("copied");
    } catch {
      if (!mountedRef.current) return;
      setStatus("error");
    }
    scheduleReset();
  }

  const label = COPY_LABELS[status];

  return (
    <button
      type="button"
      onClick={() => void copyResponse()}
      disabled={status === "copying"}
      aria-label={label.accessible}
      title={label.accessible}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors duration-150 ${
        status === "copied"
          ? "text-success"
          : status === "error"
            ? "text-danger"
            : "text-muted hover:bg-surface-raised hover:text-ink"
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="size-3.5"
      >
        {status === "copied" ? (
          <path d="m4.5 10 3.5 3.5 7.5-8" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <>
            <rect x="6" y="6" width="9" height="9" rx="1.5" />
            <path d="M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-7A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13H6" />
          </>
        )}
      </svg>
      <span aria-live="polite">{label.visible}</span>
    </button>
  );
}
