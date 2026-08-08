import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  query: "",
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  usePathname: () => "/history",
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, history: mocks.history },
  };
});

import HistoryPage from "@/app/history/page";

describe("HistoryPage workspace layout", () => {
  afterEach(() => {
    cleanup();
    mocks.history.mockReset();
    mocks.query = "";
    mocks.replace.mockReset();
    mocks.push.mockReset();
  });

  it("presents request history as a calm workspace table", async () => {
    mocks.history.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 7,
          provider: "openai",
          model: "gpt-4o-mini",
          task: "hook",
          status: "ok",
          credits_charged: "2.5",
          latency_ms: 340,
          mocked: false,
          used_fallback: false,
          created_at: "2026-08-01T08:00:00.000Z",
        },
      ],
    });

    render(<HistoryPage />);

    expect(screen.getByTestId("workspace-page-header")).toBeDefined();
    expect(await screen.findByRole("table", { name: "История запросов" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Модель и задача" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Статус" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Кредиты" })).toBeDefined();
  });
});
