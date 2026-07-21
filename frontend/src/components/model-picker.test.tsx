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
    current_requests: 2,
    target_requests: 5,
    current_days: 1,
    target_days: 3,
  },
];

describe("ModelPicker", () => {
  afterEach(cleanup);

  it("offers Auto and selects an unlocked model", () => {
    const onSelect = vi.fn();
    render(<ModelPicker models={models} selectedModel={null} onSelect={onSelect} />);

    const select = screen.getByRole("combobox", { name: "Model" });
    expect((select as HTMLSelectElement).value).toBe("");
    expect(screen.getByRole("option", { name: "gpt-5-mini · openai" })).toBeDefined();
    fireEvent.change(select, { target: { value: "gpt-5-mini" } });
    expect(onSelect).toHaveBeenCalledWith("gpt-5-mini");
  });

  it("keeps locked models visible with progress but unavailable", () => {
    render(<ModelPicker models={models} selectedModel={null} onSelect={vi.fn()} />);

    const locked = screen.getByRole("option", {
      name: "claude-sonnet-4 · anthropic — locked: 2/5 requests, 1/3 days",
    }) as HTMLOptionElement;
    expect(locked.disabled).toBe(true);
  });
});
