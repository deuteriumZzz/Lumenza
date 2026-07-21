import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyResponseButton } from "@/components/copy-response-button";

describe("CopyResponseButton", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("copies the complete assistant response and confirms success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CopyResponseButton text={"First line\nSecond line"} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy response" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("First line\nSecond line"),
    );
    expect(
      screen.getByRole("button", { name: "Response copied" }),
    ).toBeDefined();
  });

  it("shows an accessible retry state when copying fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });

    render(<CopyResponseButton text="Assistant response" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy response" }));

    expect(
      await screen.findByRole("button", {
        name: "Could not copy response. Try again",
      }),
    ).toBeDefined();
  });

  it("does not let an earlier reset interrupt a new copy attempt", async () => {
    vi.useFakeTimers();
    let resolveSecondCopy: (() => void) | undefined;
    const writeText = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecondCopy = resolve;
          }),
      );
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<CopyResponseButton text="Assistant response" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
    });
    expect(screen.getByRole("button", { name: "Response copied" })).toBeDefined();

    act(() => vi.advanceTimersByTime(1000));
    fireEvent.click(screen.getByRole("button", { name: "Response copied" }));
    act(() => vi.advanceTimersByTime(1000));

    expect(
      screen.getByRole("button", { name: "Copying response" }),
    ).toBeDefined();
    await act(async () => resolveSecondCopy?.());
  });

  it("does not schedule feedback after unmounting during a clipboard write", async () => {
    vi.useFakeTimers();
    let resolveCopy: (() => void) | undefined;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveCopy = resolve;
            }),
        ),
      },
    });

    const { unmount } = render(
      <CopyResponseButton text="Assistant response" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy response" }));
    unmount();
    await act(async () => resolveCopy?.());

    expect(vi.getTimerCount()).toBe(0);
  });
});
