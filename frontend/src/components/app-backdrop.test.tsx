import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AppBackdrop } from "@/components/app-backdrop";

describe("AppBackdrop", () => {
  afterEach(cleanup);

  it("keeps one network layer mounted while routed content changes", () => {
    const { container, rerender } = render(
      <AppBackdrop>
        <div data-testid="route-content">Landing</div>
      </AppBackdrop>,
    );
    const initialBackground = container.querySelector(
      '[data-testid="ambient-network-background"]',
    );

    rerender(
      <AppBackdrop>
        <div data-testid="route-content">Register</div>
      </AppBackdrop>,
    );

    expect(
      container.querySelectorAll('[data-testid="ambient-network-background"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-testid="ambient-network-background"]'),
    ).toBe(initialBackground);
    expect(container.textContent).toContain("Register");
  });
});
