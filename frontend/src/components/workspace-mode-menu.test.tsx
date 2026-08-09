import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceModeMenu } from "@/components/workspace-mode-menu";

describe("WorkspaceModeMenu", () => {
  afterEach(cleanup);

  it.each([
    ["chat", "Chat"],
    ["agents", "AI Agent"],
    ["knowledge", "Knowledge"],
  ] as const)("marks %s as the current workspace", (mode, label) => {
    render(<WorkspaceModeMenu mode={mode} />);
    fireEvent.click(screen.getByRole("button", { name: `Режим: ${label}` }));

    expect(screen.getByRole("link", { name: label }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<WorkspaceModeMenu mode="chat" />);
    const trigger = screen.getByRole("button", { name: "Режим: Chat" });
    fireEvent.click(trigger);
    screen.getByRole("link", { name: "AI Agent" }).focus();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() =>
      expect(screen.queryByRole("navigation", { name: "Режим Lumenza" })).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
  });
});
