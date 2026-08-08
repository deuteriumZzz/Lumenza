"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

// Small account-avatar circle linking to /profile, matching the top-right
// avatar seen on the Agents/Account references
// (docs/redesign-references/approved/{agents,account}.png) next to the
// page's primary action. Deliberately a plain link (no dropdown) rather
// than reusing AccountMenu's sidebar-anchored popover, whose
// `left-full`/`bottom-0` positioning assumes a left-edge trigger and would
// render off-screen up here.
export function WorkspaceAccountAvatar() {
  const { user } = useAuth();
  if (!user) return null;
  const initial = user.username.slice(0, 1).toUpperCase();

  return (
    <Link
      href="/profile"
      aria-label={`Аккаунт ${user.username}`}
      className="account-avatar workspace-top-avatar"
    >
      {initial}
    </Link>
  );
}

// Pricing link + account avatar, for pages whose reference shows a "Тариф"
// pill instead of (or alongside) a page-specific primary action — see
// docs/redesign-references/approved/account.png.
export function WorkspaceTopActions() {
  return (
    <div className="workspace-top-actions">
      <Link href="/pricing" className="workspace-outline-button">Тариф</Link>
      <WorkspaceAccountAvatar />
    </div>
  );
}
