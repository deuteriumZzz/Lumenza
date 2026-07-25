"use client";

import { useEffect, useRef, useState } from "react";
import type { TelegramWidgetPayload } from "@/lib/api";

interface TelegramLoginWindow extends Window {
  Telegram?: {
    Login: {
      auth: (
        options: { bot_id: string; request_access?: "write" },
        callback: (user: TelegramWidgetPayload | false) => void
      ) => void;
    };
  };
}

interface TelegramLoginButtonProps {
  botId: string;
  onAuth: (payload: TelegramWidgetPayload) => void;
}

const SCRIPT_SRC = "https://telegram.org/js/telegram-widget.js?22";

let widgetScriptPromise: Promise<void> | null = null;

function loadWidgetScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as TelegramLoginWindow).Telegram?.Login) return Promise.resolve();
  if (!widgetScriptPromise) {
    widgetScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${SCRIPT_SRC}"]`
      );
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () =>
          reject(new Error("telegram-widget script failed to load"))
        );
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("telegram-widget script failed to load"));
      document.head.appendChild(script);
    });
  }
  return widgetScriptPromise;
}

// Официальный виджет "Login with Telegram" по умолчанию рендерит себя сам
// как белый iframe (https://core.telegram.org/widgets/login) — не
// поддерживает нашу тёмную тему и на неавторизованном для бота домене
// (например localhost) показывает ошибку "Bot domain invalid" прямо
// внутри себя, белой полосой посреди страницы. Вместо авто-виджета грузим
// тот же telegram-widget.js только ради его JS API (Telegram.Login.auth) —
// он открывает тот же OAuth-попап, но саму кнопку-триггер рисуем в нашем
// стиле, в едином языке с остальным интерфейсом.
export function TelegramLoginButton({ botId, onAuth }: TelegramLoginButtonProps) {
  const onAuthRef = useRef(onAuth);
  const [status, setStatus] = useState<"idle" | "pending" | "unavailable">(
    "idle"
  );

  useEffect(() => {
    onAuthRef.current = onAuth;
  }, [onAuth]);

  useEffect(() => {
    if (!botId) return;
    loadWidgetScript().catch(() => setStatus("unavailable"));
  }, [botId]);

  async function handleClick() {
    if (!botId || status === "pending") return;
    setStatus("pending");
    try {
      await loadWidgetScript();
      const login = (window as TelegramLoginWindow).Telegram?.Login;
      if (!login) {
        setStatus("unavailable");
        return;
      }
      login.auth({ bot_id: botId, request_access: "write" }, (user) => {
        setStatus("idle");
        if (user) onAuthRef.current(user);
      });
    } catch {
      setStatus("unavailable");
    }
  }

  if (status === "unavailable") return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "pending"}
      className="telegram-login-button"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        className="telegram-login-glyph"
      >
        <circle cx="12" cy="12" r="10.25" className="telegram-login-ring" />
        <polygon
          points="17.75 6.75 6.75 11.15 10.6 12.55 12.15 17 17.75 6.75"
          className="telegram-login-plane"
          strokeLinejoin="round"
        />
        <polyline
          points="10.6 12.55 17.75 6.75 12.9 14.4"
          className="telegram-login-plane"
          strokeLinejoin="round"
        />
      </svg>
      {status === "pending" ? "Открываем Telegram…" : "Войти через Telegram"}
    </button>
  );
}
