import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandCursor } from "@/components/brand-cursor";

function mockMedia({
  finePointer,
  reducedMotion,
}: {
  finePointer: boolean;
  reducedMotion: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query.includes("pointer: fine") ? finePointer : reducedMotion,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
}

describe("BrandCursor", () => {
  beforeEach(() => {
    mockMedia({ finePointer: true, reducedMotion: false });
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.customCursor;
  });

  it("uses a luminous asymmetric arrow in Lumenza styling on fine pointers", () => {
    render(<BrandCursor />);

    expect(document.documentElement.dataset.customCursor).toBe("true");
    const cursor = screen.getByTestId("brand-cursor");
    const arrow = cursor.querySelector<SVGElement>(".brand-cursor-arrow");
    const glow = cursor.querySelector<SVGPathElement>(
      ".brand-cursor-arrow-glow",
    );
    const shape = cursor.querySelector<SVGPathElement>(
      ".brand-cursor-arrow-shape",
    );

    expect(cursor.getAttribute("aria-hidden")).toBe("true");
    expect(arrow?.style.color).toBe("var(--color-primary)");
    expect(glow?.getAttribute("fill")).toBe("none");
    expect(glow?.getAttribute("stroke")).toBe("currentColor");
    expect(shape?.getAttribute("fill")).toBe("var(--cursor-arrow-fill)");
    expect(shape?.getAttribute("stroke")).toBe("var(--cursor-arrow-outline)");
    expect(cursor.querySelector(".brand-cursor-halo")).toBeNull();
    expect(cursor.querySelector(".brand-cursor-dot")).toBeNull();
    expect(cursor.querySelectorAll(".brand-cursor-track")).toHaveLength(1);
  });

  it("matches Kimi by yielding to the native pointer over actions", () => {
    render(
      <>
        <BrandCursor />
        <button type="button">Открыть</button>
      </>,
    );

    fireEvent.pointerMove(window, { clientX: 120, clientY: 80 });
    fireEvent.pointerOver(screen.getByRole("button", { name: "Открыть" }));

    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-interactive"),
    ).toBe("true");
    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-native"),
    ).toBe("true");
  });

  it("tracks pointer press and releases without getting stuck", () => {
    render(<BrandCursor />);

    fireEvent.pointerMove(window, { clientX: 120, clientY: 80 });
    fireEvent.pointerDown(window);
    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-pressed"),
    ).toBe("true");

    fireEvent.pointerUp(window);
    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-pressed"),
    ).toBe("false");
  });

  it("yields to the native text cursor over editable fields", () => {
    render(
      <>
        <BrandCursor />
        <textarea aria-label="Сообщение" />
      </>,
    );

    fireEvent.pointerOver(screen.getByRole("textbox", { name: "Сообщение" }));

    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-native"),
    ).toBe("true");
  });

  it("keeps the native cursor when reduced motion is requested", () => {
    mockMedia({ finePointer: true, reducedMotion: true });

    render(<BrandCursor />);

    expect(document.documentElement.dataset.customCursor).toBeUndefined();
    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-visible"),
    ).toBe("false");
  });

  it("enables after a real mouse move when pointer media initializes late", () => {
    mockMedia({ finePointer: false, reducedMotion: false });

    render(<BrandCursor />);
    expect(document.documentElement.dataset.customCursor).toBeUndefined();

    const mousePointerMove = new Event("pointermove");
    Object.defineProperty(mousePointerMove, "pointerType", { value: "mouse" });
    fireEvent(window, mousePointerMove);

    expect(document.documentElement.dataset.customCursor).toBe("true");
    expect(screen.getByTestId("brand-cursor")).toBeDefined();
  });

  it("hides the custom arrow when a hybrid device switches to touch", () => {
    render(<BrandCursor />);
    const cursor = screen.getByTestId("brand-cursor");
    const mouseMove = new Event("pointermove");
    Object.defineProperty(mouseMove, "pointerType", { value: "mouse" });
    fireEvent(window, mouseMove);
    expect(cursor.getAttribute("data-visible")).toBe("true");

    const touchDown = new Event("pointerdown");
    Object.defineProperty(touchDown, "pointerType", { value: "touch" });
    fireEvent(window, touchDown);
    expect(cursor.getAttribute("data-visible")).toBe("false");
    expect(cursor.getAttribute("data-pressed")).toBe("false");

    fireEvent(window, mouseMove);
    expect(cursor.getAttribute("data-visible")).toBe("true");

    const touchMove = new Event("pointermove");
    Object.defineProperty(touchMove, "pointerType", { value: "touch" });
    fireEvent(window, touchMove);

    expect(cursor.getAttribute("data-visible")).toBe("false");
  });
});
