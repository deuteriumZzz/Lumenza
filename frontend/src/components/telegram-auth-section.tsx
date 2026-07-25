"use client";

import { useEffect, useState } from "react";
import { TelegramLoginButton } from "@/components/telegram-login-button";
import { api, apiErrorMessage, type TelegramWidgetPayload } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface TelegramAuthSectionProps {
  label: string;
  onSuccess?: () => void;
}

// Общая обёртка для трёх мест, где нужен один и тот же виджет: /login и
// /register (вход/регистрация через Telegram) и /pricing (привязка
// Telegram к уже залогиненному веб-аккаунту) — backend сам решает, какой
// это случай, по наличию сессии (accounts.views.telegram_auth).
export function TelegramAuthSection({ label, onSuccess }: TelegramAuthSectionProps) {
  const { authenticateWithTelegram } = useAuth();
  const [botId, setBotId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.publicConfig().then(
      (config) => setBotId(config.telegram_bot_id || null),
      () => setBotId(null)
    );
  }, []);

  async function handleAuth(payload: TelegramWidgetPayload) {
    setError(null);
    try {
      await authenticateWithTelegram("widget", payload);
      onSuccess?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  // Пока бот не сконфигурирован (TELEGRAM_BOT_TOKEN пуст в .env) кнопка
  // всё равно не смогла бы открыть валидный OAuth-попап — молча ничего не
  // показываем, а не кнопку, которая ведёт в никуда.
  if (!botId) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <TelegramLoginButton botId={botId} onAuth={handleAuth} />
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
