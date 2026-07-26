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
    expect(cursor.getAttribute("data-mode")).toBe("default");
    expect(cursor.getAttribute("data-size")).toBe("small");
    expect(cursor.style.getPropertyValue("--cursor-arrow-width")).toBe("1rem");
    expect(cursor.style.getPropertyValue("--cursor-arrow-height")).toBe(
      "1.13rem",
    );
    expect(cursor.style.getPropertyValue("--cursor-halo-size")).toBe("1.38rem");
    expect(cursor.style.getPropertyValue("--cursor-caret-height")).toBe("0.8rem");
    expect(cursor.style.getPropertyValue("--cursor-burst-size")).toBe("0.8rem");
    expect(arrow?.style.color).toBe("var(--color-primary)");
    expect(glow?.getAttribute("fill")).toBe("none");
    expect(glow?.getAttribute("stroke")).toBe("currentColor");
    expect(shape?.getAttribute("fill")).toBe("var(--cursor-arrow-fill)");
    expect(shape?.getAttribute("stroke")).toBe("var(--cursor-arrow-outline)");
    expect(cursor.querySelectorAll(".brand-cursor-track")).toHaveLength(1);
  });

  it("stays the same custom cursor over buttons instead of yielding to the native pointer", () => {
    render(
      <>
        <BrandCursor />
        <button type="button">Открыть</button>
      </>,
    );

    fireEvent.pointerMove(window, { clientX: 120, clientY: 80 });
    fireEvent.pointerOver(screen.getByRole("button", { name: "Открыть" }));

    const cursor = screen.getByTestId("brand-cursor");
    expect(cursor.getAttribute("data-mode")).toBe("pointer");
    expect(cursor.getAttribute("data-visible")).toBe("true");
  });

  it("switches to the text-caret mode over editable fields instead of the native I-beam", () => {
    render(
      <>
        <BrandCursor />
        <textarea aria-label="Сообщение" />
      </>,
    );

    fireEvent.pointerMove(window, { clientX: 120, clientY: 80 });
    fireEvent.pointerOver(screen.getByRole("textbox", { name: "Сообщение" }));

    const cursor = screen.getByTestId("brand-cursor");
    expect(cursor.getAttribute("data-mode")).toBe("text");
    expect(cursor.getAttribute("data-visible")).toBe("true");
  });

  it("marks disabled controls with the disabled cursor mode", () => {
    render(
      <>
        <BrandCursor />
        <button type="button" disabled>
          Недоступно
        </button>
      </>,
    );

    fireEvent.pointerMove(window, { clientX: 120, clientY: 80 });
    fireEvent.pointerOver(screen.getByRole("button", { name: "Недоступно" }));

    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-mode"),
    ).toBe("disabled");
  });

  it("tracks pointer press, releases without getting stuck, and fires a click burst", () => {
    render(<BrandCursor />);

    fireEvent.pointerMove(window, { clientX: 120, clientY: 80 });
    fireEvent.pointerDown(window);
    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-pressed"),
    ).toBe("true");
    expect(
      screen.getByTestId("brand-cursor-burst").classList.contains("is-active"),
    ).toBe(true);

    fireEvent.pointerUp(window);
    expect(
      screen.getByTestId("brand-cursor").getAttribute("data-pressed"),
    ).toBe("false");
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
