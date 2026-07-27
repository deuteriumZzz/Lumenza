import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModelPicker } from "@/components/model-picker";
import type { ModelProgress } from "@/lib/api";

const models: ModelProgress[] = [
  {
    task: "repurpose",
    provider: "openai",
    model: "gpt-5-mini",
    unlocked: true,
    access_class: "standard",
    current_requests: 0,
    target_requests: 0,
    current_days: 0,
    target_days: 0,
  },
  {
    task: "longform",
    provider: "openai",
    model: "gpt-5-mini",
    unlocked: true,
    access_class: "standard",
    current_requests: 0,
    target_requests: 0,
    current_days: 0,
    target_days: 0,
  },
  {
    task: "repurpose",
    provider: "anthropic",
    model: "claude-sonnet-4",
    unlocked: false,
    access_class: "premium",
    current_requests: 2,
    target_requests: 5,
    current_days: 1,
    target_days: 3,
  },
];

describe("ModelPicker", () => {
  afterEach(cleanup);

  it("opens a compact list and selects an unlocked model", () => {
    const onSelect = vi.fn();
    render(<ModelPicker models={models} selectedModel={null} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Модель: Автовыбор" }));
    fireEvent.click(screen.getByRole("button", { name: /gpt-5-mini · openai/i }));

    expect(onSelect).toHaveBeenCalledWith("gpt-5-mini", "repurpose");
  });

  it("deduplicates the same provider/model across compatible tasks", () => {
    render(<ModelPicker models={models} selectedModel={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Модель: Автовыбор" }));

    expect(screen.getAllByRole("button", { name: /gpt-5-mini · openai/i })).toHaveLength(1);
  });

  it("keeps premium models visible with an upgrade label but unavailable", () => {
    render(<ModelPicker models={models} selectedModel={null} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Модель: Автовыбор" }));
    fireEvent.click(screen.getByRole("button", { name: /Premium-модели/i }));
    const locked = screen.getByRole("button", { name: /claude-sonnet-4 · anthropic/i });

    expect(locked.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText("Доступно в Pro")).toBeDefined();
  });

  it("labels automatic routing explicitly", () => {
    render(<ModelPicker models={models} selectedModel={null} onSelect={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Модель: Автовыбор" })).toBeDefined();
  });

  it("filters models and closes with Escape without changing selection", () => {
    const onSelect = vi.fn();
    render(<ModelPicker models={models} selectedModel={null} onSelect={onSelect} />);

    const trigger = screen.getByRole("button", { name: "Модель: Автовыбор" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("searchbox", { name: "Найти модель" }), {
      target: { value: "does-not-exist" },
    });
    expect(screen.getByText("Модели не найдены")).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Выбор модели" })).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("can return from an explicit model to automatic routing", () => {
    const onSelect = vi.fn();
    render(
      <ModelPicker
        models={models}
        selectedModel="gpt-5-mini"
        selectedTask="repurpose"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Модель: gpt-5-mini · openai/i }));
    fireEvent.click(screen.getByRole("button", { name: /Автовыбор/i }));

    expect(onSelect).toHaveBeenCalledWith(null, null);
  });
});
