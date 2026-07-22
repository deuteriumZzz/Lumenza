"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface TelegramCtaProps {
  className?: string;
}

// Имя бота приходит из /api/config/ (backend TELEGRAM_BOT_USERNAME), а не
// хардкодится здесь — единственный источник правды тот же, что у
// t.me/-ссылок в реферальной программе (referrals/services.py).
export function TelegramCta({ className }: TelegramCtaProps) {
  const [botUsername, setBotUsername] = useState<string | null>(null);

  useEffect(() => {
    api.publicConfig().then(
      (config) => setBotUsername(config.telegram_bot_username || null),
      () => setBotUsername(null)
    );
  }, []);

  if (!botUsername) return null;

  return (
    <a
      href={`https://t.me/${botUsername}`}
      target="_blank"
      rel="noreferrer"
      className={className}
    >
      Open in Telegram
    </a>
  );
}
