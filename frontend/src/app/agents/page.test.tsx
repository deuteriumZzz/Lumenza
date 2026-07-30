import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agents: vi.fn(),
  query: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace }),
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
    mocks.replace.mockReset();
    mocks.query = "";
  });

  const AGENTS = [
    {
      slug: "threads-content-day",
      name: "Контент на день для Threads",
      description: "Соберёт тему, аудиторию, тон и цель.",
      category: "content",
    },
    {
      slug: "research-digest",
      name: "Дайджест по теме",
      description: "Ищет источники и собирает дайджест.",
      category: "research",
    },
    {
      slug: "document-summary",
      name: "Саммари документа",
      description: "Саммари и вопросы по документу.",
      category: "documents",
    },
  ];

  it("renders a catalog card for each published agent", async () => {
    mocks.agents.mockResolvedValue(AGENTS);

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

  it("shows all agents under Популярное and filters by category tab", async () => {
    mocks.agents.mockResolvedValue(AGENTS);

    render(<AgentsPage />);

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /Дайджест по теме/ })).toBeDefined(),
    );
    // Популярное (default) shows all 3.
    expect(screen.getByRole("link", { name: /Контент на день для Threads/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Дайджест по теме/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Саммари документа/ })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Исследования" }));

    await waitFor(() =>
      expect(screen.queryByRole("link", { name: /Контент на день для Threads/ })).toBeNull(),
    );
    expect(screen.getByRole("link", { name: /Дайджест по теме/ })).toBeDefined();
    expect(screen.queryByRole("link", { name: /Саммари документа/ })).toBeNull();
  });
});
