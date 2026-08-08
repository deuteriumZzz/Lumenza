import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChatRoutingProvider } from "@/components/chat-routing";
import ToolsPage from "@/app/tools/page";

describe("ToolsPage", () => {
  afterEach(cleanup);

  it("renders All Tools as its own unified workspace", async () => {
    render(<ChatRoutingProvider>{await ToolsPage({ searchParams: Promise.resolve({}) })}</ChatRoutingProvider>);

    expect(screen.getByRole("region", { name: "Все инструменты Lumenza" })).toBeDefined();
    expect(screen.getByRole("heading", { level: 1, name: "All tools" })).toBeDefined();
    expect(screen.getByRole("list", { name: "Каталог инструментов" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Research & insights" })).toBeDefined();
  });

  it("passes a deep-linked category into the catalog", async () => {
    render(
      <ChatRoutingProvider>
        {await ToolsPage({ searchParams: Promise.resolve({ category: "presentations" }) })}
      </ChatRoutingProvider>,
    );

    expect(screen.getByRole("button", { name: "Presentations" }).getAttribute("aria-pressed")).toBe("true");
  });
});
