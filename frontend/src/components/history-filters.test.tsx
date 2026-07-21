import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryFilters } from "@/components/history-filters";

describe("HistoryFilters", () => {
  afterEach(cleanup);

  it("applies categorical filters and local date boundaries", () => {
    const onApply = vi.fn();
    render(<HistoryFilters onApply={onApply} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Task" }), {
      target: { value: "repurpose" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Provider" }), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.change(screen.getByLabelText("To date"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    const start = new Date("2026-07-20T00:00:00");
    const end = new Date("2026-07-20T00:00:00");
    end.setDate(end.getDate() + 1);
    expect(onApply).toHaveBeenCalledWith({
      task: "repurpose",
      provider: "openai",
      status: "ok",
      created_after: start.toISOString(),
      created_before: end.toISOString(),
    });
  });

  it("rejects a reversed date range and clears all filters", () => {
    const onApply = vi.fn();
    render(<HistoryFilters onApply={onApply} />);

    fireEvent.change(screen.getByLabelText("From date"), {
      target: { value: "2026-07-21" },
    });
    fireEvent.change(screen.getByLabelText("To date"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "From date must not be after to date",
    );
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onApply).toHaveBeenCalledWith({});
    expect(screen.getByLabelText<HTMLInputElement>("From date").value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("To date").value).toBe("");
  });
});
