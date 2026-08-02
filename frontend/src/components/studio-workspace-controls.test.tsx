import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioWorkspaceControls } from "@/components/studio-workspace-controls";

describe("StudioWorkspaceControls", () => {
  afterEach(cleanup);

  it.each(["Image", "Video", "Audio", "Edit", "Upscale"] as const)(
    "opens tool, model and settings panels for %s",
    (mode) => {
      render(<StudioWorkspaceControls mode={mode.toLowerCase() as Lowercase<typeof mode>} />);

      fireEvent.click(screen.getByRole("button", { name: `Инструменты ${mode}` }));
      const tools = screen.getByRole("dialog", { name: `${mode}: инструменты` });
      const firstTool = within(tools).getAllByRole("button").find((button) => button.hasAttribute("aria-pressed"));
      expect(firstTool).toBeDefined();
      fireEvent.click(firstTool!);
      expect(firstTool!.getAttribute("aria-pressed")).toBe("true");
      fireEvent.keyDown(window, { key: "Escape" });

      fireEvent.click(screen.getByRole("button", { name: `Модель ${mode}: Автовыбор` }));
      const models = screen.getByRole("dialog", { name: `${mode}: выбор модели` });
      const modelOptions = within(models).getAllByRole("button").filter((button) => button.hasAttribute("aria-pressed"));
      fireEvent.click(modelOptions[1]);
      expect(screen.getByRole("button", { name: new RegExp(`Модель ${mode}: (?!Автовыбор)`) })).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: `Настройки ${mode}` }));
      expect(screen.getByRole("dialog", { name: `${mode}: настройки` })).toBeDefined();
    },
  );

  it("keeps Image settings state visible and resettable", async () => {
    render(<StudioWorkspaceControls mode="image" />);
    const trigger = screen.getByRole("button", { name: "Настройки Image" });
    fireEvent.click(trigger);
    const settings = screen.getByRole("dialog", { name: "Image: настройки" });

    fireEvent.click(within(settings).getByRole("radio", { name: "16:9" }));
    fireEvent.click(within(settings).getByRole("radio", { name: "2K" }));
    fireEvent.click(within(settings).getByRole("radio", { name: "High" }));
    expect(within(settings).getByRole("radio", { name: "16:9" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("radio", { name: "2K" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("radio", { name: "High" })).toHaveProperty("checked", true);
    fireEvent.click(within(settings).getByRole("radio", { name: "4 variations" }));
    fireEvent.click(within(settings).getByRole("checkbox", { name: "Prompt enhancer" }));
    expect(within(settings).getByRole("radio", { name: "4 variations" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("checkbox", { name: "Prompt enhancer" })).toHaveProperty("checked", true);

    fireEvent.click(within(settings).getByRole("button", { name: "Reset" }));
    expect(within(settings).getByRole("radio", { name: "1:1" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("radio", { name: "1K" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("radio", { name: "Low" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("radio", { name: "1 variation" })).toHaveProperty("checked", true);
    expect(within(settings).getByRole("checkbox", { name: "Prompt enhancer" })).toHaveProperty("checked", false);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Image: настройки" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("filters the real routed image model list", async () => {
    render(<StudioWorkspaceControls mode="image" />);
    fireEvent.click(screen.getByRole("button", { name: "Модель Image: Автовыбор" }));
    const models = screen.getByRole("dialog", { name: "Image: выбор модели" });

    fireEvent.change(within(models).getByRole("searchbox", { name: "Поиск моделей Image" }), {
      target: { value: "dall" },
    });

    expect(within(models).getByRole("button", { name: /DALL·E 3/ })).toBeDefined();
    expect(within(models).queryByRole("button", { name: /FLUX Schnell/ })).toBeNull();
    fireEvent.click(within(models).getByRole("button", { name: "Закрыть панель" }));
    expect(screen.getByRole("button", { name: "Модель Image: Автовыбор" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("opens models and production settings in one two-column project panel", () => {
    render(<StudioWorkspaceControls mode="image" />);

    fireEvent.click(screen.getByRole("button", { name: "Модель Image: Автовыбор" }));
    const panel = screen.getByRole("dialog", { name: "Image: выбор модели" });

    expect(panel.getAttribute("data-layout")).toBe("model-settings");
    expect(within(panel).getByRole("heading", { name: "Select model" })).toBeDefined();
    expect(within(panel).getByRole("heading", { name: "Image settings" })).toBeDefined();
    expect(within(panel).getByRole("searchbox", { name: "Поиск моделей Image" })).toBeDefined();
    expect(within(panel).getByRole("radio", { name: "16:9" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Настройки Image" }));
    const settingsPanel = screen.getByRole("dialog", { name: "Image: настройки" });
    expect(within(settingsPanel).getByRole("searchbox", { name: "Поиск моделей Image" })).toBeDefined();
    expect(within(settingsPanel).getByRole("button", { name: /DALL·E 3/ })).toBeDefined();
  });

  it("shows mode-specific production settings for Video and Upscale", () => {
    const { unmount } = render(<StudioWorkspaceControls mode="video" />);
    fireEvent.click(screen.getByRole("button", { name: "Настройки Video" }));
    const videoSettings = screen.getByRole("dialog", { name: "Video: настройки" });
    expect(within(videoSettings).getByRole("radio", { name: "10 seconds" })).toBeDefined();

    unmount();
    render(<StudioWorkspaceControls mode="upscale" />);
    fireEvent.click(screen.getByRole("button", { name: "Настройки Upscale" }));
    const upscaleSettings = screen.getByRole("dialog", { name: "Upscale: настройки" });
    expect(within(upscaleSettings).getByRole("radio", { name: "4×" })).toBeDefined();
    expect(within(upscaleSettings).getByRole("slider", { name: "Face enhancement strength" })).toBeDefined();
    expect(within(upscaleSettings).getByRole("slider", { name: "Texture preservation" })).toBeDefined();
  });
});
