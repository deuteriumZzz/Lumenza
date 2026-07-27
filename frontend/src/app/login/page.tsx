"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";
import { TelegramAuthSection } from "@/components/telegram-auth-section";
import { AuthPageChrome } from "@/components/auth-page-chrome";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      router.push("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Что-то пошло не так.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageChrome>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-24">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Вход</h1>
        <p className="mt-2 text-sm text-muted">С возвращением — продолжите с того же места.</p>

        <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
          <Field label="Имя пользователя">
            <input
              required
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="input"
            />
          </Field>
          <Field label="Пароль">
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
            />
          </Field>

          {error && <p className="text-sm text-danger" role="alert">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary mt-2">
            {submitting ? "Входим…" : "Войти"}
          </button>
        </form>

        <div className="mt-6">
          <TelegramAuthSection label="Или войдите через Telegram" onSuccess={() => router.push("/home")} />
        </div>

        <p className="mt-6 text-sm text-muted">
          Ещё нет аккаунта?{" "}
          <Link href="/register" className="font-medium text-accent hover:underline">
            Создать
          </Link>
        </p>
      </div>
    </AuthPageChrome>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
    </label>
  );
}
