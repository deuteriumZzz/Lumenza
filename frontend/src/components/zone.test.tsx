import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/chat" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

import { ZoneScope } from "@/components/zone";

describe("ZoneScope", () => {
  beforeEach(() => {
    mocks.pathname = "/chat";
  });

  afterEach(cleanup);

  it.each([
    ["/chat", "desk"],
    ["/studio", "studio"],
    ["/studio/images", "studio"],
  ])("maps %s to the %s zone", (pathname, zone) => {
    mocks.pathname = pathname;
    render(<ZoneScope>Content</ZoneScope>);

    expect(screen.getByText("Content").dataset.zone).toBe(zone);
  });

  it("uses the dedicated color-token transition hook", () => {
    render(<ZoneScope>Content</ZoneScope>);

    expect(screen.getByText("Content").className).toContain("zone-scope");
  });
});
