import type { ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usageSummary: vi.fn(),
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  api: { usageSummary: mocks.usageSummary },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import UsagePage from "@/app/usage/page";

describe("UsagePage", () => {
  afterEach(() => {
    cleanup();
    mocks.usageSummary.mockReset();
  });

  it("renders totals and per-model usage", async () => {
    mocks.usageSummary.mockResolvedValue({
      total: {
        prompt_tokens: 1200,
        completion_tokens: 800,
        total_tokens: 2000,
        credits_charged: "12.5000",
        requests: 4,
      },
      by_model: [
        {
          provider: "openai",
          model: "gpt-4o-mini",
          prompt_tokens: 1200,
          completion_tokens: 800,
          total_tokens: 2000,
          credits_charged: "12.5000",
          requests: 4,
        },
      ],
    });

    render(<UsagePage />);

    expect(screen.getByTestId("workspace-page-header")).toBeDefined();
    await waitFor(() => expect(screen.getByText("GPT-4o mini")).toBeDefined());
    expect(screen.getByRole("table", { name: "Использование по моделям" })).toBeDefined();
    expect(screen.getAllByText("2 000")).toHaveLength(2);
    expect(screen.getAllByText("12,5")).toHaveLength(2);
    expect(screen.getAllByText(/4 запрос/)).toHaveLength(2);
  });

  it("renders an empty state for a new account", async () => {
    mocks.usageSummary.mockResolvedValue({
      total: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
        credits_charged: "0.0000",
        requests: 0,
      },
      by_model: [],
    });

    render(<UsagePage />);

    await waitFor(() =>
      expect(screen.getByText("Пока нет истории использования")).toBeDefined(),
    );
  });
});
