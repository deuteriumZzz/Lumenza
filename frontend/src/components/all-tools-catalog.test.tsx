import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AllToolsCatalog } from "@/components/all-tools-catalog";

describe("AllToolsCatalog", () => {
  afterEach(cleanup);

  it("keeps a searchable catalog and selected tool inspector in one workspace", () => {
    render(<AllToolsCatalog initialTool="create-image" />);

    expect(screen.getByRole("searchbox", { name: "Поиск инструментов" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Категории инструментов" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Create image" })).toBeDefined();
    expect(screen.getByRole("link", { name: "Открыть Create image" }).getAttribute("href")).toBe("/studio?mode=image");

    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск инструментов" }), { target: { value: "voice" } });
    const catalog = screen.getByRole("list", { name: "Каталог инструментов" });
    expect(within(catalog).getByRole("button", { name: /Voice cloning/i })).toBeDefined();
    expect(within(catalog).queryByRole("button", { name: /Create image/i })).toBeNull();
  });

  it("updates the inspector without replacing the catalog", () => {
    const onSelectionChange = vi.fn();
    render(<AllToolsCatalog onSelectionChange={onSelectionChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Text to speech/i }));

    expect(screen.getByRole("list", { name: "Каталог инструментов" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Text to speech" })).toBeDefined();
    expect(onSelectionChange).toHaveBeenCalledWith("text-to-speech");
  });

  it("marks provider-dependent tools as preview", () => {
    render(<AllToolsCatalog initialTool="create-video" />);

    const inspector = screen.getByRole("complementary", { name: "Create video" });
    expect(within(inspector).getByText("Preview")).toBeDefined();
    expect(within(inspector).getAllByText(/провайдер/i).length).toBeGreaterThan(0);
  });

  it("opens with the category requested by the unified workspace link", () => {
    render(<AllToolsCatalog initialCategory="data" />);

    expect(screen.getByRole("button", { name: "Data" }).getAttribute("aria-pressed")).toBe("true");
    const catalog = screen.getByRole("list", { name: "Каталог инструментов" });
    expect(within(catalog).getByRole("button", { name: /Data Analysis/i })).toBeDefined();
    expect(within(catalog).queryByRole("button", { name: /Research & Insights/i })).toBeNull();
  });
});
