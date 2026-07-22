"use client";

import { useEffect, useRef } from "react";
import type { TelegramWidgetPayload } from "@/lib/api";

interface TelegramLoginButtonProps {
  botUsername: string;
  onAuth: (payload: TelegramWidgetPayload) => void;
  size?: "large" | "medium" | "small";
}

// Виджет "Login with Telegram" рендерит сам себя как iframe рядом со своим
// <script>-тегом (через document.currentScript) — поэтому тег создаётся
// императивно и кладётся именно в этот контейнер, а не через next/script,
// который может отделить выполнение скрипта от места его вставки в DOM.
export function TelegramLoginButton({ botUsername, onAuth, size = "large" }: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !botUsername) return;

    const callbackName = `__telegramLoginCallback_${Math.random().toString(36).slice(2)}`;
    (window as unknown as Record<string, unknown>)[callbackName] = (
      user: TelegramWidgetPayload
    ) => onAuthRef.current(user);

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", size);
    script.setAttribute("data-onauth", `${callbackName}(user)`);
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [botUsername, size]);

  return <div ref={containerRef} />;
}
