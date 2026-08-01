import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioPromptDock } from "@/components/studio-prompt-dock";

describe("StudioPromptDock", () => {
  afterEach(cleanup);

  it("keeps the mode, model access, references and create action in one bottom composer", () => {
    const onPromptChange = vi.fn();
    const onSubmit = vi.fn();
    const onAddReference = vi.fn();

    render(
      <StudioPromptDock
        mode="image"
        prompt="editorial portrait"
        onPromptChange={onPromptChange}
        onSubmit={onSubmit}
        onAddReference={onAddReference}
      />,
    );

    const composer = screen.getByRole("form", { name: "Image prompt composer" });
    expect(composer.getAttribute("data-placement")).toBe("bottom");
    expect(within(composer).getByRole("button", { name: "Добавить референс" })).toBeDefined();
    expect(within(composer).getByRole("button", { name: "Инструменты Image" })).toBeDefined();
    expect(within(composer).getByRole("button", { name: /Модель Image:/ })).toBeDefined();
    expect(within(composer).getByRole("button", { name: "Настройки Image" })).toBeDefined();

    fireEvent.change(within(composer).getByRole("textbox", { name: "Промпт Image" }), {
      target: { value: "new prompt" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Создать" }));
    fireEvent.click(within(composer).getByRole("button", { name: "Добавить референс" }));

    expect(onPromptChange).toHaveBeenCalledWith("new prompt");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onAddReference).toHaveBeenCalledTimes(1);
  });

  it("shows an honest disabled state for a disconnected provider", () => {
    render(
      <StudioPromptDock
        mode="video"
        prompt=""
        onPromptChange={() => undefined}
        onSubmit={() => undefined}
        disabled
        status="Провайдер пока не подключён"
      />,
    );

    expect(screen.getByRole("button", { name: "Создать" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("status").textContent).toContain("Провайдер пока не подключён");
  });
});
