import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptionPicker } from "@/components/option-picker";

const options = [
  { value: "hook" as const, label: "Post", hint: "Write a social post" },
  { value: "longform" as const, label: "Article", hint: "Write a long article" },
];

describe("OptionPicker", () => {
  afterEach(cleanup);

  it("keeps every option selectable without progression state", () => {
    const onSelect = vi.fn();
    render(
      <OptionPicker
        ariaLabel="Задача"
        options={options}
        selected="hook"
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Article" }));
    expect(onSelect).toHaveBeenCalledWith("longform");
    expect(screen.queryByText(/запросов|дней|заблокировано/i)).toBeNull();
  });
});
