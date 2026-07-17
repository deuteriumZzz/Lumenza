"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const LINKS = [
  { href: "/chat", label: "Chat" },
  { href: "/images", label: "Images" },
  { href: "/history", label: "History" },
  { href: "/pricing", label: "Billing" },
];

export function Nav() {
  const { user, balance, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!user) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-6 py-3">
        <Link href="/chat" className="text-sm font-semibold tracking-tight text-ink">
          Lumenza
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                  active
                    ? "bg-surface-raised text-ink"
                    : "text-muted hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <div className="text-right leading-tight">
            <div className="font-mono text-sm tabular-nums text-ink">
              {balance ? Number(balance.balance).toFixed(2) : "—"}
            </div>
            <div className="text-[11px] text-muted">credits</div>
          </div>
          <button
            type="button"
            onClick={() => {
              void logout().then(() => router.replace("/login"));
            }}
            className="text-sm text-muted transition-colors duration-150 hover:text-ink"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
