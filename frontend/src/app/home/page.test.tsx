import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agent: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      agent: mocks.agent,
    },
  };
});

import HomePage from "@/app/home/page";

describe("HomePage", () => {
  afterEach(() => {
    cleanup();
    mocks.agent.mockReset();
  });

  it("renders three goal cards pointing at chat, the one agent, and studio", async () => {
    mocks.agent.mockResolvedValue({
      slug: "threads-content-day",
      name: "Контент на день для Threads",
      description: "Соберёт тему, аудиторию, тон и цель.",
    });

    render(<HomePage />);

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Контент на день для Threads/ }),
      ).toBeDefined(),
    );

    expect(screen.getByRole("link", { name: /^Чат/ }).getAttribute("href")).toBe("/chat");
    expect(
      screen
        .getByRole("link", { name: /Контент на день для Threads/ })
        .getAttribute("href"),
    ).toBe("/agents/threads-content-day");
    expect(screen.getByRole("link", { name: /^Студия/ }).getAttribute("href")).toBe(
      "/studio",
    );
  });
});
