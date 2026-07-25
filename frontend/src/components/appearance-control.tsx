"use client";

import { useEffect, useRef, useState } from "react";

type ThemePreference = "system" | "dark" | "light";
type AccentPreference = "amber" | "cyan" | "green";

const THEME_KEY = "lumenza:theme";
const ACCENT_KEY = "lumenza:accent";
const THEMES: ThemePreference[] = ["system", "dark", "light"];
const ACCENTS: AccentPreference[] = ["amber", "cyan", "green"];

function storedTheme(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return THEMES.includes(stored as ThemePreference) ? stored as ThemePreference : "system";
  } catch {
    return "system";
  }
}

function storedAccent(): AccentPreference {
  if (typeof window === "undefined") return "amber";
  try {
    const stored = window.localStorage.getItem(ACCENT_KEY);
    return ACCENTS.includes(stored as AccentPreference) ? stored as AccentPreference : "amber";
  } catch {
    return "amber";
  }
}

function persistPreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Appearance remains usable in memory when storage is unavailable.
  }
}

function resolvedTheme(preference: ThemePreference): "dark" | "light" {
  if (preference !== "system") return preference;
  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function AppearanceControl({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(storedTheme);
  const [accent, setAccent] = useState<AccentPreference>(storedAccent);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const media = typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: light)")
      : null;
    const apply = () => {
      document.documentElement.dataset.theme = resolvedTheme(theme);
      document.documentElement.dataset.themePreference = theme;
      document.documentElement.dataset.accent = accent;
    };
    apply();
    if (theme === "system") media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [theme, accent]);

  useEffect(() => {
    if (!open) return;

    function close(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    persistPreference(THEME_KEY, value);
    document.documentElement.dataset.theme = resolvedTheme(value);
    document.documentElement.dataset.themePreference = value;
  }

  function chooseAccent(value: AccentPreference) {
    setAccent(value);
    persistPreference(ACCENT_KEY, value);
    document.documentElement.dataset.accent = value;
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="Внешний вид"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`sidebar-action ${compact ? "justify-center px-0" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 4a8 8 0 0 0 0 16c2.3-2.1 3.5-4.8 3.5-8S14.3 6.1 12 4Z" />
        </svg>
        {!compact && <span>Внешний вид</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Настройки внешнего вида"
          className={`appearance-popover ${compact ? "left-full bottom-0 ml-2" : "bottom-full left-0 mb-2"}`}
        >
          <fieldset>
            <legend className="appearance-label">Тема</legend>
            <div className="grid grid-cols-3 gap-1.5">
              <AppearanceRadio
                label="Системная тема"
                shortLabel="Система"
                checked={theme === "system"}
                onChange={() => chooseTheme("system")}
              />
              <AppearanceRadio
                label="Тёмная тема"
                shortLabel="Тёмная"
                checked={theme === "dark"}
                onChange={() => chooseTheme("dark")}
              />
              <AppearanceRadio
                label="Светлая тема"
                shortLabel="Светлая"
                checked={theme === "light"}
                onChange={() => chooseTheme("light")}
              />
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="appearance-label">Акцент</legend>
            <div className="flex gap-2">
              <AccentRadio
                label="Янтарный акцент"
                color="bg-[oklch(0.72_0.14_65)]"
                checked={accent === "amber"}
                onChange={() => chooseAccent("amber")}
              />
              <AccentRadio
                label="Голубой акцент"
                color="bg-[oklch(0.72_0.11_205)]"
                checked={accent === "cyan"}
                onChange={() => chooseAccent("cyan")}
              />
              <AccentRadio
                label="Зелёный акцент"
                color="bg-[oklch(0.7_0.12_155)]"
                checked={accent === "green"}
                onChange={() => chooseAccent("green")}
              />
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

function AppearanceRadio({
  label,
  shortLabel,
  checked,
  onChange,
}: {
  label: string;
  shortLabel: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`appearance-choice ${checked ? "is-selected" : ""}`}>
      <input
        type="radio"
        name="lumenza-theme"
        aria-label={label}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      {shortLabel}
    </label>
  );
}

function AccentRadio({
  label,
  color,
  checked,
  onChange,
}: {
  label: string;
  color: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`accent-choice ${checked ? "is-selected" : ""}`}>
      <input
        type="radio"
        name="lumenza-accent"
        aria-label={label}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span className={`size-5 rounded-full ${color}`} aria-hidden="true" />
    </label>
  );
}
