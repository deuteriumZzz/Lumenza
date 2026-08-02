import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  subscriptionStatus: vi.fn(),
  referralStats: vi.fn(),
  setBalance: vi.fn(),
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/telegram-auth-section", () => ({
  TelegramAuthSection: ({ label }: { label: string }) => <button type="button">{label}</button>,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: { username: "lumenza_demo", telegram_linked: false },
    balance: { balance: "128.50" },
    setBalance: mocks.setBalance,
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      subscriptionStatus: mocks.subscriptionStatus,
      referralStats: mocks.referralStats,
    },
  };
});

import PricingPage from "@/app/pricing/page";

describe("PricingPage workspace layout", () => {
  beforeEach(() => {
    mocks.subscriptionStatus.mockResolvedValue(null);
    mocks.referralStats.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    mocks.subscriptionStatus.mockReset();
    mocks.referralStats.mockReset();
  });

  it("organizes billing into overview and payment regions", () => {
    render(<PricingPage />);

    expect(screen.getByTestId("workspace-page-header")).toBeDefined();
    expect(screen.getByRole("region", { name: "Обзор баланса" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Подписка Pro" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Способы пополнения" })).toBeDefined();
  });
});
