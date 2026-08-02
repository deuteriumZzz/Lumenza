import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: "",
  reduceMotion: false,
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
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
  Images: ({ initialMode, initialPrompt }: { initialMode?: string; initialPrompt?: string }) => (
    <div>
      <p>{initialMode === "edit" ? "Редактор изображений" : "Генератор изображений"}</p>
      {initialMode !== "edit" && <input aria-label="Черновик изображения" readOnly value={initialPrompt ?? ""} />}
      <button aria-label={`Инструменты ${initialMode === "edit" ? "Edit" : "Image"}`} />
      <button aria-label={`Модель ${initialMode === "edit" ? "Edit" : "Image"}: Автовыбор`} />
      <button aria-label={`Настройки ${initialMode === "edit" ? "Edit" : "Image"}`} />
    </div>
  ),
}));

vi.mock("@/app/voice/page", () => ({
  Voice: ({ autoStart }: { autoStart?: boolean }) => (
    <p>Голосовые инструменты{autoStart ? " · автозапуск" : ""}</p>
  ),
}));

vi.mock("@/app/documents/page", () => ({ Documents: () => <p>OCR документов</p> }));
vi.mock("@/app/analyze/page", () => ({ Analyze: () => <p>Анализ фотографий</p> }));
vi.mock("@/app/code/page", () => ({ Code: () => <p>Интерпретатор кода</p> }));

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
  it("models Studio modes as one accessible tab workspace", () => {
    mocks.query = "mode=image";
    renderStudioPage();

    expect(screen.getByRole("tablist", { name: "Режим студии" })).toBeDefined();
    const imageTab = screen.getByRole("tab", { name: "Image" });
    expect(imageTab.getAttribute("aria-selected")).toBe("true");
    expect(imageTab.getAttribute("aria-controls")).toBe("studio-panel-image");
    expect(screen.getByRole("tabpanel").id).toBe("studio-panel-image");
  });
  afterEach(() => {
    cleanup();
    mocks.query = "";
    mocks.reduceMotion = false;
    mocks.replace.mockReset();
    mocks.push.mockReset();
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
    ).toBe("image");
    expect(screen.getByRole("tab", { name: "Image" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Video" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Audio" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Edit" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Upscale" })).toBeDefined();
    expect(screen.getByTestId("studio-inspiration-feed")).toBeDefined();
    expect(screen.getByRole("button", { name: "Photography" })).toBeDefined();
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector(".studio-shell")?.className).not.toContain("flex-col");
  });

  it("transitions the content panel when a different studio mode is selected", () => {
    renderStudioPage();

    fireEvent.click(screen.getByRole("tab", { name: "Audio" }));

    expect(screen.getByText("Голосовые инструменты")).toBeDefined();
    expect(
      document
        .querySelector('[data-testid="studio-mode-panel"][data-mode="audio"]')
        ?.getAttribute("data-mode"),
    ).toBe("audio");
    expect(
      screen.getByRole("tab", { name: "Audio" }).getAttribute("aria-selected"),
    ).toBe("true");

    const outgoingPanel = document.querySelector(
      '[data-testid="studio-mode-panel"][data-mode="image"]',
    );
    expect(outgoingPanel?.getAttribute("aria-hidden")).toBe("true");
    expect(outgoingPanel?.hasAttribute("inert")).toBe(true);
  });

  it("animates every studio tool through the same content stage", () => {
    renderStudioPage();

    fireEvent.click(screen.getByRole("tab", { name: "Video" }));
    expect(screen.getByText("Video workspace")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));
    expect(screen.getByText("Редактор изображений")).toBeDefined();

    fireEvent.click(screen.getByRole("tab", { name: "Upscale" }));
    expect(screen.getByText("Upscale workspace")).toBeDefined();
  });

  it("honors the voice deep link while disabling motion when requested", () => {
    mocks.query = "mode=voice&autostart=1";
    mocks.reduceMotion = true;

    renderStudioPage();

    expect(screen.getByText("Голосовые инструменты · автозапуск")).toBeDefined();
    expect(screen.getByRole("tab", { name: "Audio" }).getAttribute("aria-selected"))
      .toBe("true");
  });

  it("opens every Studio tool from a sidebar deep link", () => {
    mocks.query = "mode=upscale";

    renderStudioPage();

    expect(screen.getByText("Upscale workspace")).toBeDefined();
    expect(screen.getByRole("tab", { name: "Upscale" }).getAttribute("aria-selected"))
      .toBe("true");
  });

  it.each([
    ["mode=documents", "OCR документов"],
    ["mode=analyze", "Анализ фотографий"],
    ["mode=code", "Интерпретатор кода"],
  ])("preserves the legacy %s Studio capability", (query, expected) => {
    mocks.query = query;
    renderStudioPage();
    expect(screen.getByText(expected)).toBeDefined();
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

    fireEvent.click(screen.getByRole("tab", { name: "Edit" }));
    expect(mocks.replace).toHaveBeenCalledWith("/studio", { scroll: false });
  });

  it.each([
    ["view=tools", "All tools"],
    ["view=apps", "Lumenza Apps"],
    ["view=community", "Community"],
  ])("renders the %s catalog as a separate Studio view", (query, heading) => {
    mocks.query = query;
    renderStudioPage();

    expect(screen.getByRole("heading", { name: heading })).toBeDefined();
  });

  it.each([
    ["image", "Image"],
    ["video", "Video"],
    ["audio", "Audio"],
    ["edit", "Edit"],
    ["upscale", "Upscale"],
  ])("wires %s to shared tools, model and settings controls", (mode, label) => {
    mocks.query = `mode=${mode}`;
    renderStudioPage();

    const workspace = screen.getByRole("region", { name: `${label} workspace` });
    expect(within(workspace).getByRole("button", { name: `Инструменты ${label}` })).toBeDefined();
    expect(within(workspace).getByRole("button", { name: new RegExp(`Модель ${label}:`) })).toBeDefined();
    expect(within(workspace).getByRole("button", { name: `Настройки ${label}` })).toBeDefined();
  });

  it("filters Apps cards with interactive controls", () => {
    mocks.query = "view=apps";
    renderStudioPage();

    fireEvent.click(screen.getByRole("button", { name: "Design" }));
    expect(screen.getByRole("button", { name: "Design" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("heading", { name: "Social cut" })).toBeNull();

    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск Apps" }), {
      target: { value: "нет такого" },
    });
    expect(screen.getByRole("status").textContent).toContain("Ничего не найдено");
  });

  it("switches Community filters interactively", () => {
    mocks.query = "view=community";
    renderStudioPage();

    fireEvent.click(screen.getByRole("button", { name: "Popular" }));
    expect(screen.getByRole("button", { name: "Popular" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Daily picks" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("filters the Image inspiration feed without leaving the workspace", () => {
    renderStudioPage();

    fireEvent.click(screen.getByRole("button", { name: "Photography" }));

    expect(screen.getByRole("button", { name: "Photography" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Violet editorial")).toBeDefined();
    expect(screen.getByRole("link", { name: "Использовать идею Violet editorial" }).getAttribute("href"))
      .toBe("/studio?mode=image&draft=Violet%20editorial");
    expect(screen.queryByText("Liquid typography")).toBeNull();
    expect(screen.getByText("Генератор изображений")).toBeDefined();
  });

  it("remounts the image workspace when an inspiration draft arrives on the same route", () => {
    const { rerender } = renderStudioPage();
    expect(screen.getByLabelText("Черновик изображения")).toHaveProperty("value", "");

    mocks.query = "mode=image&draft=Chrome%20still%20life";
    rerender(
      <ZoneProvider>
        <StudioPage />
      </ZoneProvider>,
    );

    expect(screen.getByLabelText("Черновик изображения")).toHaveProperty(
      "value",
      "Chrome still life",
    );
  });

  it("keeps a bottom image composer available in Community", () => {
    mocks.query = "view=community";
    renderStudioPage();

    const form = screen.getByRole("form", { name: "Community image composer" });
    fireEvent.change(within(form).getByRole("textbox", { name: "Промпт" }), {
      target: { value: "Editorial portrait with violet rim light" },
    });
    fireEvent.submit(form);

    expect(mocks.push).toHaveBeenCalledWith(
      "/studio?mode=image&draft=Editorial%20portrait%20with%20violet%20rim%20light",
    );
    expect(form.closest("section")?.classList.contains("has-prompt-dock")).toBe(true);
  });

  it.each(["video", "upscale"])("allows preparing %s projects while honestly disabling generation", (mode) => {
    mocks.query = `mode=${mode}`;
    renderStudioPage();

    const form = screen.getByRole("form", { name: new RegExp(`${mode}`, "i") });
    expect(within(form).getByRole("button", { name: "Создать" })).toHaveProperty("disabled", true);
    expect(within(form).getByRole("button", { name: "Добавить референс" })).toHaveProperty("disabled", false);
    expect(screen.getByLabelText(mode === "video" ? "Загрузить медиа для видео" : "Загрузить изображение для upscale")).toBeDefined();
    expect(screen.getByRole("status").textContent).toContain("Провайдер пока не подключён");
  });
});
