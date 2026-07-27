"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";

// Компактная строка "аватар + имя" внизу сайдбара, раскрывающая меню
// аккаунта вверх — тот же паттерн, что у ChatGPT/Claude/DeepSeek: одно
// самое частое место, откуда видно, что ты вошёл, и откуда доступны
// тариф/баланс и выход, а не разбросано по отдельным ссылкам.
export function AccountMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { user, balance, logout } = useAuth();
  const { locale, setLocale } = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  if (!user) return null;

  const initial = user.username.slice(0, 1).toUpperCase();
  const planLabel =
    user.tier === "paid" ? "Pro" : locale === "ru" ? "Базовый" : "Base";
  const credits = balance ? Math.trunc(Number(balance.balance)) : null;
  const copy =
    locale === "ru"
      ? {
          dialog: "Аккаунт",
          credits: "кредитов",
          pricing: "Тариф и кредиты",
          usage: "Использование",
          language: "Язык",
          about: "О нас",
          logout: "Выйти",
          telegram: "Telegram Mini App",
        }
      : {
          dialog: "Account",
          credits: "credits",
          pricing: "Plan and credits",
          usage: "Usage",
          language: "Language",
          about: "About",
          logout: "Sign out",
          telegram: "Telegram Mini App",
        };

  async function handleLogout() {
    setOpen(false);
    setLanguageOpen(false);
    await logout();
    router.push("/login");
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          collapsed ? `Аккаунт ${user.username}, тариф ${planLabel}` : undefined
        }
        onClick={() => setOpen((current) => !current)}
        className={`account-menu-trigger ${collapsed ? "justify-center px-0" : ""}`}
      >
        <span className="account-avatar" aria-hidden="true">
          {initial}
        </span>
        {!collapsed && (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-sm text-ink">{user.username}</span>
            <span className="block truncate text-xs text-muted">
              {planLabel}
              {credits !== null ? ` · ${credits} ${copy.credits}` : ""}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={copy.dialog}
          className={`account-menu-popover ${collapsed ? "left-full bottom-0 ml-2" : "bottom-full left-0 mb-2"}`}
        >
          <div className="account-menu-header">
            <span className="account-avatar account-avatar-lg" aria-hidden="true">
              {initial}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">
                {user.username}
              </span>
              <span className="block truncate text-xs text-muted">
                {user.email || copy.telegram}
              </span>
            </span>
            <span className="account-menu-plan-badge">{planLabel}</span>
          </div>

          <Link
            href="/pricing"
            onClick={() => {
              setOpen(false);
              setLanguageOpen(false);
            }}
            className="account-menu-item"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
              <path d="M3.5 10h17M7 14.5h3" strokeLinecap="round" />
            </svg>
            <span>{copy.pricing}</span>
          </Link>

          <Link
            href="/usage"
            onClick={() => {
              setOpen(false);
              setLanguageOpen(false);
            }}
            className="account-menu-item"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 19V9m7 10V5m7 14v-7" strokeLinecap="round" />
              <path d="M3.5 19.5h17" strokeLinecap="round" />
            </svg>
            <span>{copy.usage}</span>
          </Link>

          <button
            type="button"
            aria-expanded={languageOpen}
            aria-controls="account-language-options"
            onClick={() => setLanguageOpen((current) => !current)}
            className="account-menu-item"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5C9.8 18.1 8.7 15.3 8.7 12S9.8 5.9 12 3.5Z" />
            </svg>
            <span>{copy.language}</span>
            <span className="ml-auto text-xs uppercase text-muted">{locale}</span>
          </button>

          {languageOpen && (
            <div id="account-language-options" className="account-language-options">
              {(["ru", "en"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={locale === option}
                  onClick={() => setLocale(option)}
                  className={`account-language-choice ${locale === option ? "is-selected" : ""}`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          <Link
            href="/about"
            onClick={() => {
              setOpen(false);
              setLanguageOpen(false);
            }}
            className="account-menu-item"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M12 10.5V16M12 7.5h.01" strokeLinecap="round" />
            </svg>
            <span>{copy.about}</span>
          </Link>

          <div className="account-menu-divider" />

          <button type="button" onClick={handleLogout} className="account-menu-item">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M15 4.5H8a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" strokeLinecap="round" />
              <path d="M11 12h9.5m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{copy.logout}</span>
          </button>
        </div>
      )}
    </div>
  );
}
