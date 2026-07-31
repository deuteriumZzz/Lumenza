import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: "",
  reduceMotion: false,
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/studio",
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return {
    ...actual,
    useReducedMotion: () => mocks.reduceMotion,
  };
});

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/app/images/page", () => ({
  Images: () => <p>Генератор изображений</p>,
}));

vi.mock("@/app/voice/page", () => ({
  Voice: ({ autoStart }: { autoStart?: boolean }) => (
    <p>Голосовые инструменты{autoStart ? " · автозапуск" : ""}</p>
  ),
}));

vi.mock("@/app/documents/page", () => ({
  Documents: () => <p>Инструменты документов</p>,
}));

vi.mock("@/app/analyze/page", () => ({
  Analyze: () => <p>Анализ изображений</p>,
}));

vi.mock("@/app/code/page", () => ({
  Code: () => <p>Код-песочница</p>,
}));

import StudioPage from "@/app/studio/page";
import { ZoneProvider } from "@/components/zone";

function renderStudioPage() {
  return render(
    <ZoneProvider>
      <StudioPage />
    </ZoneProvider>,
  );
}

describe("StudioPage motion", () => {
  afterEach(() => {
    cleanup();
    mocks.query = "";
    mocks.reduceMotion = false;
    mocks.replace.mockReset();
  });

  it("uses an animated mode stage and shared active indicator", () => {
    renderStudioPage();

    expect(screen.getByTestId("studio-mode-navigation")).toBeDefined();
    expect(
      screen.getByTestId("studio-mode-navigation").className,
    ).toContain("studio-mode-navigation");
    expect(screen.getByTestId("studio-navigation-mark")).toBeDefined();
    expect(screen.getAllByTestId("studio-active-indicator")).toHaveLength(1);
    expect(
      screen.getByTestId("studio-mode-panel").getAttribute("data-mode"),
    ).toBe("images");
  });

  it("transitions the content panel when a different studio mode is selected", () => {
    renderStudioPage();

    fireEvent.click(screen.getByRole("button", { name: /Голос/i }));

    expect(screen.getByText("Голосовые инструменты")).toBeDefined();
    expect(
      document
        .querySelector('[data-testid="studio-mode-panel"][data-mode="voice"]')
        ?.getAttribute("data-mode"),
    ).toBe("voice");
    expect(
      screen.getByRole("button", { name: /Голос/i }).getAttribute("aria-pressed"),
    ).toBe("true");

    const outgoingPanel = document.querySelector(
      '[data-testid="studio-mode-panel"][data-mode="images"]',
    );
    expect(outgoingPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(outgoingPanel?.hasAttribute("inert")).toBe(true);
  });

  it("animates every studio tool through the same content stage", () => {
    renderStudioPage();

    fireEvent.click(screen.getByRole("button", { name: /Документы/i }));
    expect(screen.getByText("Инструменты документов")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Анализ фото/i }));
    expect(screen.getByText("Анализ изображений")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^Код/i }));
    expect(screen.getByText("Код-песочница")).toBeDefined();
  });

  it("honors the voice deep link while disabling motion when requested", () => {
    mocks.query = "mode=voice&autostart=1";
    mocks.reduceMotion = true;

    renderStudioPage();

    expect(screen.getByText("Голосовые инструменты · автозапуск")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Голос/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("opens every Studio tool from a sidebar deep link", () => {
    mocks.query = "mode=documents";

    renderStudioPage();

    expect(screen.getByText("Инструменты документов")).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Документы/i }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("reacts when the voice hotkey updates search params on the same route", () => {
    const { rerender } = renderStudioPage();
    expect(screen.getByText("Генератор изображений")).toBeDefined();

    mocks.query = "mode=voice&autostart=1";
    rerender(
      <ZoneProvider>
        <StudioPage />
      </ZoneProvider>,
    );

    expect(screen.getByText("Голосовые инструменты · автозапуск")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Документы/i }));
    expect(mocks.replace).toHaveBeenCalledWith("/studio", { scroll: false });
  });
});
