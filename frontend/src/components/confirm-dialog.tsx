"use client";

import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  pendingLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Единственный переиспользуемый confirm-диалог в приложении — вместо семи
// разных попапов на «Удалить»/«Архивировать»/«Отключить». Оверлей +
// focus trap + Escape + клик по фону — тот же паттерн, что у ImageLightbox
// (fixed inset-0 бэкдроп, циклический Tab, возврат фокуса на элемент,
// который был активен до открытия), только центрированная карточка вместо
// просмотрщика картинки и стили карточки — как у model-picker-popover.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Удалить",
  pendingLabel,
  cancelLabel = "Отмена",
  destructive = true,
  pending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    confirmRef.current?.focus();

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (pending) return;
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="w-full max-w-sm rounded-2xl border border-border/80 bg-surface/98 p-5 shadow-2xl backdrop-blur-xl"
      >
        <h2 id={titleId} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-sm leading-6 text-muted">
            {description}
          </p>
        )}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={pending} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={
              destructive
                ? "inline-flex items-center justify-center rounded-md bg-danger px-4 py-2 text-sm font-medium text-bg transition duration-150 hover:-translate-y-px hover:opacity-90 active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                : "btn-primary"
            }
          >
            {pending ? (pendingLabel ?? confirmLabel) : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
