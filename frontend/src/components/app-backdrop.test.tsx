import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppBackdrop } from "@/components/app-backdrop";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import { ZoneProvider } from "@/components/zone";

describe("AppBackdrop", () => {
  afterEach(cleanup);

  it("keeps one network layer mounted while routed content changes", () => {
    const { container, rerender } = render(
      <ZoneProvider>
        <AppBackdrop>
          <div data-testid="route-content">Landing</div>
        </AppBackdrop>
      </ZoneProvider>,
    );
    const initialBackground = container.querySelector(
      '[data-testid="ambient-network-background"]',
    );

    rerender(
      <ZoneProvider>
        <AppBackdrop>
          <div data-testid="route-content">Register</div>
        </AppBackdrop>
      </ZoneProvider>,
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
