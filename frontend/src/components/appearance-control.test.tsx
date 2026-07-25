import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceControl } from "@/components/appearance-control";

describe("AppearanceControl", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-accent");
  });

  afterEach(cleanup);

  it("persists theme and accent choices on the document", () => {
    render(<AppearanceControl />);

    fireEvent.click(screen.getByRole("button", { name: "Внешний вид" }));
    fireEvent.click(screen.getByRole("radio", { name: "Светлая тема" }));
    fireEvent.click(screen.getByRole("radio", { name: "Голубой акцент" }));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.accent).toBe("cyan");
    expect(localStorage.getItem("lumenza:theme")).toBe("light");
    expect(localStorage.getItem("lumenza:accent")).toBe("cyan");

    fireEvent.click(screen.getByRole("radio", { name: "Зелёный акцент" }));

    expect(document.documentElement.dataset.accent).toBe("green");
    expect(localStorage.getItem("lumenza:accent")).toBe("green");
  });

  it("tracks the system theme and closes with Escape", () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener,
        removeEventListener,
      })),
    });

    render(<AppearanceControl compact />);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));

    const trigger = screen.getByRole("button", { name: "Внешний вид" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Настройки внешнего вида" })).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Настройки внешнего вида" })).toBeNull();

    cleanup();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
