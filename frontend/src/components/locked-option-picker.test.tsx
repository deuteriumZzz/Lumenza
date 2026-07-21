import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LockedOptionPicker } from "@/components/locked-option-picker";

const options = [{ value: "hook" as const, label: "Post", hint: "Write a social post" }];

describe("LockedOptionPicker", () => {
  afterEach(cleanup);

  it("includes unlock progress in the accessible name and blocks selection", () => {
    const onSelect = vi.fn();
    render(
      <LockedOptionPicker
        ariaLabel="Task"
        options={options}
        selected="hook"
        onSelect={onSelect}
        isUnlocked={() => false}
        progressFor={() => ({
          key: "hook",
          current_requests: 2,
          target_requests: 5,
          current_days: 1,
          target_days: 3,
        })}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Post. Locked — 2/5 requests, 1/3 days",
    });
    expect(button.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps an unlocked option selectable with its concise label", () => {
    const onSelect = vi.fn();
    render(
      <LockedOptionPicker
        ariaLabel="Task"
        options={options}
        selected="other"
        onSelect={onSelect}
        isUnlocked={() => true}
        progressFor={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    expect(onSelect).toHaveBeenCalledWith("hook");
  });
});
