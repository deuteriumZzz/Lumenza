"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type Workspace } from "@/lib/api";

interface WorkspacePickerProps {
  selectedWorkspaceId: number | null;
  onSelect: (workspace: Workspace | null) => void;
}

// Тот же попап-паттерн, что у PresetPicker/ModelPicker (кнопка-триггер,
// outside-click + Escape, общие CSS-классы model-picker-*) — проще
// PresetPicker, так как здесь нет формы создания (workspace создаётся на
// странице /knowledge).
export function WorkspacePicker({ selectedWorkspaceId, onSelect }: WorkspacePickerProps) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || workspaces !== null) return;
    api
      .workspaces()
      .then(setWorkspaces, (err) => setError(apiErrorMessage(err, "Не удалось загрузить базы знаний.")));
  }, [open, workspaces]);

  const selectedWorkspace = workspaces?.find((workspace) => workspace.id === selectedWorkspaceId) ?? null;

  function select(workspace: Workspace | null) {
    onSelect(workspace);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`База знаний: ${selectedWorkspace ? selectedWorkspace.name : "нет"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="model-picker-trigger"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4.5h6a2 2 0 0 1 2 2V16H6a2 2 0 0 1-2-2V4.5Z" strokeLinejoin="round" />
          <path d="M12 6.5h4v9.5h-4" strokeLinejoin="round" />
        </svg>
        <span className="max-w-32 truncate">{selectedWorkspace ? selectedWorkspace.name : "База знаний"}</span>
      </button>

      {open && (
        <div className="model-picker-popover">
          <div role="dialog" aria-label="Базы знаний" className="max-h-[26rem] overflow-y-auto p-2">
            {error && (
              <p role="alert" className="px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            {workspaces === null && !error && (
              <p className="px-3 py-6 text-center text-sm text-muted">Загрузка…</p>
            )}

            {workspaces && workspaces.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted">
                Пока нет баз знаний — создайте на странице «Knowledge».
              </p>
            )}

            {workspaces?.map((workspace) => (
              <button
                key={workspace.id}
                type="button"
                aria-pressed={workspace.id === selectedWorkspaceId}
                onClick={() => select(workspace)}
                className="model-picker-option"
              >
                <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-ink">
                  {workspace.name}
                </span>
                {workspace.id === selectedWorkspaceId && (
                  <span className="text-primary" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            ))}

            {selectedWorkspace && (
              <button type="button" onClick={() => select(null)} className="model-picker-option mt-1">
                <span className="min-w-0 flex-1 text-left text-sm text-muted">Отключить базу знаний</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
