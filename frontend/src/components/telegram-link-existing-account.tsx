"use client";

import { useState, type FormEvent } from "react";
import { apiErrorMessage } from "@/lib/api";
import { getTelegramWebAppInitData, useAuth } from "@/lib/auth-context";

// Только что созданный через Mini App аккаунт (telegram_id, которого мы
// раньше не видели) не знает о существующем сайтовом аккаунте того же
// человека — это дыра, которую тут закрываем: даём один шанс сразу же
// войти в существующий аккаунт и слить их, вместо того чтобы молча
// застрять на пустом новом.
export function TelegramLinkExistingAccount() {
  const { telegramJustCreated, dismissTelegramJustCreated, linkTelegramToExistingAccount } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!telegramJustCreated || !getTelegramWebAppInitData()) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await linkTelegramToExistingAccount(username, password);
    } catch (err) {
      setError(apiErrorMessage(err, "Could not sign in and link this account."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-4 mt-4 rounded-md border border-border bg-surface p-4">
      <p className="text-sm font-medium text-ink">Already have a Lumenza account?</p>
      <p className="mt-1 text-xs text-muted">
        Sign in to link it — your balance and history will carry over here.
      </p>

      <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
        <input
          required
          autoComplete="username"
          placeholder="Username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="input"
        />
        <input
          required
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="input"
        />

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}

        <div className="mt-1 flex items-center gap-2">
          <button type="submit" disabled={submitting} className="btn-primary flex-1">
            {submitting ? "Linking…" : "Sign in & link"}
          </button>
          <button type="button" onClick={dismissTelegramJustCreated} className="btn-secondary">
            Continue as new
          </button>
        </div>
      </form>
    </div>
  );
}
