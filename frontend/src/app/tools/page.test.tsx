import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ToolsPage from "@/app/tools/page";

describe("ToolsPage", () => {
  afterEach(cleanup);

  it("renders All Tools as its own unified workspace", async () => {
    render(await ToolsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("region", { name: "Все инструменты Lumenza" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "All Tools" })).toBeDefined();
    expect(screen.getByRole("list", { name: "Каталог инструментов" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Research & Insights" })).toBeDefined();
  });

  it("passes a deep-linked category into the catalog", async () => {
    render(await ToolsPage({ searchParams: Promise.resolve({ category: "presentations" }) }));

    expect(screen.getByRole("button", { name: "Presentations" }).getAttribute("aria-pressed")).toBe("true");
  });
});
