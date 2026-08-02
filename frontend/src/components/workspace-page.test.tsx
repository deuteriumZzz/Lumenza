import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceHeader, WorkspacePage, WorkspacePanel } from "@/components/workspace-page";

describe("workspace page primitives", () => {
  afterEach(cleanup);

  it("composes one labelled page with a calm header and actions", () => {
    render(
      <WorkspacePage ariaLabel="База знаний">
        <WorkspaceHeader
          eyebrow="Workspace"
          title="Knowledge"
          description="Источники и коллекции"
          actions={<button type="button">Импортировать</button>}
        />
        <WorkspacePanel ariaLabel="Источники"><p>Содержимое</p></WorkspacePanel>
      </WorkspacePage>,
    );

    const page = screen.getByRole("region", { name: "База знаний" });
    expect(page.className).toContain("workspace-page");
    expect(screen.getByRole("heading", { level: 1, name: "Knowledge" })).toBeDefined();
    expect(screen.getByText("Workspace")).toBeDefined();
    expect(screen.getByText("Источники и коллекции")).toBeDefined();
    expect(screen.getByRole("button", { name: "Импортировать" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Источники" }).className).toContain("workspace-panel");
  });

  it("supports an inspector column without introducing another page shell", () => {
    render(
      <WorkspacePage ariaLabel="Каталог" inspector={<aside aria-label="Детали инструмента" />}>Каталог</WorkspacePage>,
    );

    expect(screen.getByRole("region", { name: "Каталог" }).className).toContain("has-inspector");
    expect(screen.getByRole("complementary", { name: "Детали инструмента" })).toBeDefined();
  });
});
