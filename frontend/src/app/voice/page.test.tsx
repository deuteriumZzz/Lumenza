import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ refreshBalance: vi.fn() }),
}));

import { Voice } from "@/app/voice/page";

describe("Voice Mini App layout", () => {
  afterEach(cleanup);

  it("stacks upload and generation actions on narrow screens", () => {
    render(<Voice />);

    expect(screen.getByTestId("voice-content").className).toContain(
      "studio-content",
    );
    expect(
      screen.getByTestId("voice-transcribe-actions").className,
    ).toContain("studio-action-row");
    expect(screen.getByTestId("voice-speech-actions").className).toContain(
      "studio-action-row",
    );
  });
});
