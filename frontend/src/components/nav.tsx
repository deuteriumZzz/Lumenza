"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useAuth } from "@/lib/auth-context";
import type { Balance } from "@/lib/api";
import { TelegramCta } from "@/components/telegram-cta";
import { LumenzaBrand } from "@/components/lumenza-brand";
import { StudioMark } from "@/components/studio-mark";
import { motionTokens } from "@/lib/motion";

const LINKS = [
  { href: "/chat", label: "Чат" },
  { href: "/studio", label: "Студия", studio: true },
  { href: "/history", label: "История" },
  { href: "/pricing", label: "Оплата" },
];

const LOW_BALANCE_THRESHOLD = 10;

function BalanceDisplay({ balance }: { balance: Balance | null }) {
  const numericBalance = balance ? Number(balance.balance) : null;
  const validBalance =
    numericBalance !== null && Number.isFinite(numericBalance)
      ? numericBalance
      : null;
  const [balanceAnimation, setBalanceAnimation] = useState<{
    value: number | null;
    change: "idle" | "increase" | "decrease";
  }>({ value: validBalance, change: "idle" });

  if (balanceAnimation.value !== validBalance) {
    const change =
      balanceAnimation.value === null || validBalance === null
        ? "idle"
        : validBalance > balanceAnimation.value
          ? "increase"
          : "decrease";
    setBalanceAnimation({ value: validBalance, change });
  }

  const change = balanceAnimation.change;
  const isLow = validBalance !== null && validBalance < LOW_BALANCE_THRESHOLD;
  const formattedBalance =
    validBalance === null ? "—" : validBalance.toFixed(2);

  const colorClass = isLow
    ? "text-danger"
    : change === "increase"
      ? "text-success"
      : "text-ink";
  const animationClass =
    change === "increase"
      ? "balance-change-increase"
      : change === "decrease"
        ? "balance-change-decrease"
        : "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={
        validBalance === null
          ? "Баланс недоступен"
          : `Баланс ${formattedBalance} кредитов`
      }
      data-balance-change={change}
      className="text-right leading-tight"
    >
      <div
        onAnimationEnd={() =>
          setBalanceAnimation((current) => ({ ...current, change: "idle" }))
        }
        className={`font-mono text-sm tabular-nums transition-colors duration-200 ${colorClass} ${animationClass}`}
      >
        {formattedBalance}
      </div>
      <div className={`text-[11px] ${isLow ? "text-danger" : "text-muted"}`}>
        кредитов
      </div>
    </div>
  );
}

export function Nav() {
  const { user, balance, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileNavigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    mobileNavigationRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      menuButtonRef.current?.focus();
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileMenuOpen]);

  const publicRoute =
    pathname === "/" || pathname === "/login" || pathname === "/register";
  const hasDedicatedShell =
    pathname.startsWith("/chat") || pathname.startsWith("/studio");
  if (!user || publicRoute || hasDedicatedShell) return null;

  function signOut() {
    setMobileMenuOpen(false);
    void logout().then(() => router.replace("/login"));
  }

  return (
    <motion.header
      initial={
        shouldReduceMotion
          ? false
          : { opacity: 0, y: -motionTokens.distance.md }
      }
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : motionTokens.duration.normal,
        ease: motionTokens.easing.smooth,
      }}
      className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 sm:px-6 md:gap-6">
        <LumenzaBrand href="/chat" />

        <nav aria-label="Основная навигация" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-surface-raised text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {link.studio && (
                  <StudioMark active={active} className="size-4 shrink-0" />
                )}
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto hidden items-center gap-4 md:flex">
          <TelegramCta className="text-sm text-muted transition-colors duration-150 hover:text-ink" />
          <BalanceDisplay balance={balance} />
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-muted transition-colors duration-150 hover:text-ink"
          >
            Выйти
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3 md:hidden">
          <BalanceDisplay balance={balance} />
          <button
            ref={menuButtonRef}
            type="button"
            aria-label={mobileMenuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-controls="mobile-navigation"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((open) => !open)}
            className="inline-flex size-10 items-center justify-center rounded-md border border-border text-ink transition-colors duration-150 hover:bg-surface-raised"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
            >
              {mobileMenuOpen ? (
                <>
                  <path d="M6 6l12 12" />
                  <path d="M18 6L6 18" />
                </>
              ) : (
                <>
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav
          ref={mobileNavigationRef}
          id="mobile-navigation"
          aria-label="Мобильная навигация"
          className="border-t border-border px-4 py-3 md:hidden"
        >
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-1">
            {LINKS.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                    active
                      ? "bg-surface-raised text-ink"
                      : "text-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {link.studio && (
                    <StudioMark active={active} className="size-4.5 shrink-0" />
                  )}
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
          <TelegramCta className="mx-auto mt-3 block w-full max-w-5xl rounded-md border border-border px-3 py-2 text-left text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-ink" />
          <button
            type="button"
            onClick={signOut}
            className="mx-auto mt-3 block w-full max-w-5xl rounded-md border border-border px-3 py-2 text-left text-sm text-muted transition-colors duration-150 hover:bg-surface hover:text-ink"
          >
            Выйти
          </button>
        </nav>
      )}
    </motion.header>
  );
}
