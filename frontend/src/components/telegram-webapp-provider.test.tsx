import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TelegramWebAppProvider,
  useTelegramWebApp,
} from "@/components/telegram-webapp-provider";

function TelegramProbe() {
  const telegram = useTelegramWebApp();
  return (
    <output>
      {telegram.ready
        ? `${telegram.isMiniApp}:${telegram.initData ?? "none"}`
        : "waiting"}
    </output>
  );
}

describe("TelegramWebAppProvider", () => {
  afterEach(() => {
    cleanup();
    delete (window as Window & { Telegram?: unknown }).Telegram;
    document.documentElement.removeAttribute("data-telegram-mini-app");
    document.documentElement.style.removeProperty("--lumenza-safe-top");
    document.documentElement.style.removeProperty("--lumenza-safe-bottom");
    document.documentElement.style.removeProperty(
      "--lumenza-viewport-stable-height",
    );
    window.history.replaceState({}, "", "/");
  });

  it("marks an ordinary browser ready without pretending it is Telegram", async () => {
    render(
      <TelegramWebAppProvider>
        <TelegramProbe />
      </TelegramWebAppProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("false:none")).toBeDefined(),
    );
  });

  it("does not treat the SDK object alone as a Mini App launch", async () => {
    const ready = vi.fn();
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: "",
        ready,
        expand: vi.fn(),
        onEvent: vi.fn(),
        offEvent: vi.fn(),
      },
    };

    render(
      <TelegramWebAppProvider>
        <TelegramProbe />
      </TelegramWebAppProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("false:none")).toBeDefined(),
    );
    expect(ready).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.telegramMiniApp).toBeUndefined();
  });

  it("initializes Telegram, exposes initData, and applies safe areas", async () => {
    const ready = vi.fn();
    const expand = vi.fn();
    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: "signed-init-data",
        colorScheme: "dark",
        viewportStableHeight: 724,
        ready,
        expand,
        contentSafeAreaInset: { top: 12, right: 0, bottom: 18, left: 0 },
        onEvent: vi.fn(),
        offEvent: vi.fn(),
      },
    };

    render(
      <TelegramWebAppProvider>
        <TelegramProbe />
      </TelegramWebAppProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("true:signed-init-data")).toBeDefined(),
    );
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.telegramMiniApp).toBe("true");
    expect(
      document.documentElement.style.getPropertyValue("--lumenza-safe-top"),
    ).toBe("12px");
    expect(
      document.documentElement.style.getPropertyValue("--lumenza-safe-bottom"),
    ).toBe("18px");
    expect(
      document.documentElement.style.getPropertyValue(
        "--lumenza-viewport-stable-height",
      ),
    ).toBe("724px");
  });

  it("waits for a delayed SDK when Telegram launch params are in the hash", async () => {
    window.history.replaceState(
      {},
      "",
      "/#tgWebAppData=signed&tgWebAppVersion=8.0&tgWebAppPlatform=android",
    );
    const ready = vi.fn();
    const expand = vi.fn();

    render(
      <TelegramWebAppProvider>
        <TelegramProbe />
      </TelegramWebAppProvider>,
    );

    expect(screen.getByText("waiting")).toBeDefined();

    (window as Window & { Telegram?: unknown }).Telegram = {
      WebApp: {
        initData: "delayed-signed-init-data",
        ready,
        expand,
        onEvent: vi.fn(),
        offEvent: vi.fn(),
      },
    };

    await waitFor(() =>
      expect(screen.getByText("true:delayed-signed-init-data")).toBeDefined(),
    );
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });
});
