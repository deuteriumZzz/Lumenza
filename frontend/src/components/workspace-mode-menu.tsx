"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type WorkspaceMode = "chat" | "agents" | "knowledge";

const MODES = [
  { key: "chat", href: "/chat", label: "Chat", description: "Обычный диалог с AI" },
  { key: "agents", href: "/agents", label: "AI Agent", description: "Многошаговые workflow" },
  { key: "knowledge", href: "/knowledge", label: "Knowledge", description: "Ответы по вашим источникам" },
] as const satisfies readonly {
  key: WorkspaceMode;
  href: string;
  label: string;
  description: string;
}[];

export function WorkspaceModeMenu({ mode }: { mode: WorkspaceMode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = MODES.find((item) => item.key === mode) ?? MODES[0];

  useEffect(() => {
    if (!open) return;
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="agent-mode-picker">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Режим: ${current.label}`}
        aria-expanded={open}
        aria-controls="lumenza-workspace-mode-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {current.label} <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <nav id="lumenza-workspace-mode-navigation" aria-label="Режим Lumenza" className="agent-mode-menu">
          {MODES.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-label={item.label}
              aria-current={item.key === mode ? "page" : undefined}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
