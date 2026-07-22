import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HistoryFilters } from "@/components/history-filters";

describe("HistoryFilters", () => {
  afterEach(cleanup);

  it("applies categorical filters and local date boundaries", () => {
    const onApply = vi.fn();
    render(<HistoryFilters onApply={onApply} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Задача" }), {
      target: { value: "repurpose" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Провайдер" }), {
      target: { value: "openai" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Статус" }), {
      target: { value: "ok" },
    });
    fireEvent.change(screen.getByLabelText("С даты"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.change(screen.getByLabelText("По дату"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Применить фильтры" }));

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

    fireEvent.change(screen.getByLabelText("С даты"), {
      target: { value: "2026-07-21" },
    });
    fireEvent.change(screen.getByLabelText("По дату"), {
      target: { value: "2026-07-20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Применить фильтры" }));

    expect(screen.getByRole("alert").textContent).toContain(
      "Дата «с» не может быть позже даты «по»",
    );
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(onApply).toHaveBeenCalledWith({});
    expect(screen.getByLabelText<HTMLInputElement>("С даты").value).toBe("");
    expect(screen.getByLabelText<HTMLInputElement>("По дату").value).toBe("");
  });
});
