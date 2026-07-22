"use client";

import Script from "next/script";

// Обмен initData на сессию живёт в auth-context.tsx (loadSession) — здесь
// только жизненный цикл самого Telegram WebApp SDK: сообщить Telegram,
// что приложение готово показываться, и развернуть его на весь экран.
// Вне Telegram (обычный браузер) window.Telegram просто не появится —
// onReady ничего не делает.
export function TelegramWebAppProvider() {
  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onReady={() => {
        const webApp = (
          window as unknown as { Telegram?: { WebApp?: { ready: () => void; expand: () => void } } }
        ).Telegram?.WebApp;
        webApp?.ready();
        webApp?.expand();
      }}
    />
  );
}
