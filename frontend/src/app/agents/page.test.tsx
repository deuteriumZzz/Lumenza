import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agents: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      agents: mocks.agents,
    },
  };
});

import AgentsPage from "@/app/agents/page";

describe("AgentsPage", () => {
  afterEach(() => {
    cleanup();
    mocks.agents.mockReset();
  });

  it("renders a catalog card for each published agent", async () => {
    mocks.agents.mockResolvedValue([
      {
        slug: "threads-content-day",
        name: "Контент на день для Threads",
        description: "Соберёт тему, аудиторию, тон и цель.",
      },
    ]);

    render(<AgentsPage />);

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Контент на день для Threads/ }),
      ).toBeDefined(),
    );
    expect(
      screen
        .getByRole("link", { name: /Контент на день для Threads/ })
        .getAttribute("href"),
    ).toBe("/agents/threads-content-day");
  });
});
