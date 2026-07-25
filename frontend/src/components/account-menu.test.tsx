import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  logout: vi.fn(),
  user: null as {
    id: number;
    username: string;
    email: string;
    telegram_linked: boolean;
    tier: "free" | "paid";
  } | null,
  balance: null as { balance: string; updated_at: string } | null,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mocks.user,
    balance: mocks.balance,
    logout: mocks.logout,
  }),
}));

import { AccountMenu } from "@/components/account-menu";

describe("AccountMenu", () => {
  beforeEach(() => {
    mocks.user = {
      id: 1,
      username: "alice",
      email: "alice@example.com",
      telegram_linked: false,
      tier: "free",
    };
    mocks.balance = { balance: "1250", updated_at: "" };
  });

  afterEach(() => {
    cleanup();
    mocks.push.mockReset();
    mocks.logout.mockReset();
  });

  it("shows who is signed in and their plan/balance at a glance", () => {
    render(<AccountMenu />);

    expect(screen.getByText("alice")).toBeDefined();
    expect(screen.getByText(/Free/)).toBeDefined();
    expect(screen.getByText(/1250 кредитов/)).toBeDefined();
  });

  it("opens a menu with plan/credits and sign-out, then closes on outside click", () => {
    render(
      <div>
        <AccountMenu />
        <button type="button">Outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /alice/ }));

    const dialog = screen.getByRole("dialog", { name: "Аккаунт" });
    expect(dialog).toBeDefined();
    expect(screen.getByRole("link", { name: /Тариф и кредиты/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Выйти/ })).toBeDefined();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog", { name: "Аккаунт" })).toBeNull();
  });

  it("logs out and redirects to /login", async () => {
    render(<AccountMenu />);

    fireEvent.click(screen.getByRole("button", { name: /alice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Выйти/ }));

    expect(mocks.logout).toHaveBeenCalled();
    await Promise.resolve();
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });

  it("renders nothing when there is no signed-in user", () => {
    mocks.user = null;
    const { container } = render(<AccountMenu />);
    expect(container.firstChild).toBeNull();
  });
});
