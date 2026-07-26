"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

interface TelegramInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

interface TelegramWebApp {
  initData?: string;
  colorScheme?: "light" | "dark";
  viewportHeight?: number;
  viewportStableHeight?: number;
  contentSafeAreaInset?: TelegramInsets;
  safeAreaInset?: TelegramInsets;
  ready?: () => void;
  expand?: () => void;
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
}

interface TelegramWebAppState {
  ready: boolean;
  isMiniApp: boolean;
  initData: string | null;
}

const TelegramWebAppContext = createContext<TelegramWebAppState>({
  ready: false,
  isMiniApp: false,
  initData: null,
});

function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  return (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp ?? null;
}

function launchLooksLikeTelegram() {
  if (typeof window === "undefined") return false;
  const sources = [
    window.location.search,
    window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash,
  ];
  return sources.some((source) => {
    const params = new URLSearchParams(source);
    return (
      params.has("tgWebAppData") ||
      params.has("tgWebAppVersion") ||
      params.has("tgWebAppPlatform")
    );
  });
}

function setSafeArea(webApp: TelegramWebApp) {
  const insets = webApp.contentSafeAreaInset ?? webApp.safeAreaInset ?? {};
  const root = document.documentElement;
  root.style.setProperty("--lumenza-safe-top", `${insets.top ?? 0}px`);
  root.style.setProperty("--lumenza-safe-right", `${insets.right ?? 0}px`);
  root.style.setProperty("--lumenza-safe-bottom", `${insets.bottom ?? 0}px`);
  root.style.setProperty("--lumenza-safe-left", `${insets.left ?? 0}px`);
}

function setStableViewportHeight(webApp: TelegramWebApp) {
  const root = document.documentElement;
  const stableHeight = webApp.viewportStableHeight ?? webApp.viewportHeight;
  if (typeof stableHeight === "number" && Number.isFinite(stableHeight) && stableHeight > 0) {
    root.style.setProperty("--lumenza-viewport-stable-height", `${stableHeight}px`);
  } else {
    root.style.removeProperty("--lumenza-viewport-stable-height");
  }
}

function applyTelegramEnvironment(webApp: TelegramWebApp) {
  const root = document.documentElement;
  root.dataset.telegramMiniApp = "true";
  if (
    root.dataset.themePreference === "system" &&
    (webApp.colorScheme === "light" || webApp.colorScheme === "dark")
  ) {
    root.dataset.theme = webApp.colorScheme;
  }
  setSafeArea(webApp);
  setStableViewportHeight(webApp);
}

function isTelegramMiniApp(webApp: TelegramWebApp) {
  return Boolean(webApp.initData) || launchLooksLikeTelegram();
}

export function TelegramWebAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, setState] = useState<TelegramWebAppState>(() => {
    if (typeof window === "undefined") {
      return { ready: false, isMiniApp: false, initData: null };
    }
    const webApp = getWebApp();
    if (webApp) {
      const isMiniApp = isTelegramMiniApp(webApp);
      return {
        ready: true,
        isMiniApp,
        initData: webApp.initData || null,
      };
    }
    return {
      ready: !launchLooksLikeTelegram(),
      isMiniApp: false,
      initData: null,
    };
  });

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let removeListeners: (() => void) | undefined;
    let attempts = 0;

    function initialize() {
      const webApp = getWebApp();
      if (!webApp) {
        if (launchLooksLikeTelegram() && attempts < 40) {
          attempts += 1;
          retryTimer = setTimeout(initialize, 50);
          return;
        }
        if (!cancelled) {
          setState({ ready: true, isMiniApp: false, initData: null });
        }
        return;
      }

      const isMiniApp = isTelegramMiniApp(webApp);
      if (isMiniApp) {
        webApp.ready?.();
        webApp.expand?.();
        applyTelegramEnvironment(webApp);
      }
      if (!cancelled) {
        setState({
          ready: true,
          isMiniApp,
          initData: webApp.initData || null,
        });
      }

      const syncEnvironment = () => applyTelegramEnvironment(webApp);
      if (isMiniApp) {
        for (const event of [
          "themeChanged",
          "safeAreaChanged",
          "contentSafeAreaChanged",
          "viewportChanged",
        ]) {
          webApp.onEvent?.(event, syncEnvironment);
        }
      }

      removeListeners = () => {
        if (!isMiniApp) return;
        for (const event of [
          "themeChanged",
          "safeAreaChanged",
          "contentSafeAreaChanged",
          "viewportChanged",
        ]) {
          webApp.offEvent?.(event, syncEnvironment);
        }
      };
    }

    initialize();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      removeListeners?.();
    };
  }, []);

  return (
    <TelegramWebAppContext.Provider value={state}>
      {children}
    </TelegramWebAppContext.Provider>
  );
}

export function useTelegramWebApp() {
  return useContext(TelegramWebAppContext);
}
