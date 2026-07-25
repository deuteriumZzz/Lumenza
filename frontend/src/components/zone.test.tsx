import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/chat" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

import {
  useSetStudioMode,
  ZoneProvider,
  ZoneScope,
  type StudioMode,
} from "@/components/zone";

function StudioModeButton({ mode }: { mode: StudioMode }) {
  const setStudioMode = useSetStudioMode();
  return (
    <button type="button" onClick={() => setStudioMode(mode)}>
      {mode}
    </button>
  );
}

describe("ZoneScope", () => {
  beforeEach(() => {
    mocks.pathname = "/chat";
  });

  afterEach(cleanup);

  it.each([
    ["/chat", "desk"],
    ["/studio", "studio"],
    ["/studio/images", "studio"],
  ])("maps %s to the %s zone by default", (pathname, zone) => {
    mocks.pathname = pathname;
    render(
      <ZoneProvider>
        <ZoneScope>Content</ZoneScope>
      </ZoneProvider>,
    );

    expect(screen.getByText("Content").dataset.zone).toBe(zone);
  });

  it("uses the dedicated color-token transition hook", () => {
    render(
      <ZoneProvider>
        <ZoneScope>Content</ZoneScope>
      </ZoneProvider>,
    );

    expect(screen.getByText("Content").className).toContain("zone-scope");
  });

  it.each([
    ["images", "studio"],
    ["analyze", "studio"],
    ["voice", "voice"],
    ["documents", "archive"],
  ])(
    "maps the %s studio mode to the %s zone once selected",
    (mode, zone) => {
      mocks.pathname = "/studio";
      render(
        <ZoneProvider>
          <StudioModeButton mode={mode as StudioMode} />
          <ZoneScope>Content</ZoneScope>
        </ZoneProvider>,
      );

      act(() => {
        screen.getByRole("button", { name: mode }).click();
      });

      expect(screen.getByText("Content").dataset.zone).toBe(zone);
    },
  );

  it("falls back to the desk zone outside /studio regardless of the last studio mode", () => {
    mocks.pathname = "/studio";
    const { rerender } = render(
      <ZoneProvider>
        <StudioModeButton mode="voice" />
        <ZoneScope>Content</ZoneScope>
      </ZoneProvider>,
    );

    act(() => {
      screen.getByRole("button", { name: "voice" }).click();
    });
    expect(screen.getByText("Content").dataset.zone).toBe("voice");

    mocks.pathname = "/chat";
    rerender(
      <ZoneProvider>
        <StudioModeButton mode="voice" />
        <ZoneScope>Content</ZoneScope>
      </ZoneProvider>,
    );

    expect(screen.getByText("Content").dataset.zone).toBe("desk");
  });
});
