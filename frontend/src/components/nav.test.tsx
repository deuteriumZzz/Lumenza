import type { AnchorHTMLAttributes, ReactNode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/chat",
  replace: vi.fn(),
  logout: vi.fn(async () => undefined),
  auth: {
    user: {
      id: 1,
      username: "tester",
      email: "tester@example.com",
      tier: "free",
    } as {
      id: number;
      username: string;
      email: string;
      tier: string;
    } | null,
    balance: { balance: "100.00" } as { balance: string } | null,
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ ...mocks.auth, logout: mocks.logout }),
}));

import { Nav } from "@/components/nav";

describe("Nav", () => {
  beforeEach(() => {
    mocks.pathname = "/chat";
    mocks.auth.user = {
      id: 1,
      username: "tester",
      email: "tester@example.com",
      tier: "free",
    };
    mocks.auth.balance = { balance: "100.00" };
    mocks.logout.mockClear();
    mocks.replace.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens and closes an accessible mobile navigation menu", () => {
    render(<Nav />);

    const trigger = screen.getByRole("button", { name: "Открыть меню" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Мобильная навигация" })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const mobileNavigation = screen.getByRole("navigation", { name: "Мобильная навигация" });
    expect(within(mobileNavigation).getByRole("link", { name: "История" })).toBeDefined();

    fireEvent.click(within(mobileNavigation).getByRole("link", { name: "История" }));
    expect(screen.queryByRole("navigation", { name: "Мобильная навигация" })).toBeNull();
  });

  it("marks the current page in desktop and mobile navigation", () => {
    render(<Nav />);

    fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));

    const currentLinks = screen.getAllByRole("link", { name: "Чат", current: "page" });
    expect(currentLinks).toHaveLength(2);
  });

  it("closes the mobile menu with Escape", () => {
    render(<Nav />);
    fireEvent.click(screen.getByRole("button", { name: "Открыть меню" }));

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("navigation", { name: "Мобильная навигация" })).toBeDefined();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Мобильная навигация" })).toBeNull();
    expect(screen.getByRole("button", { name: "Открыть меню" })).toBeDefined();
  });

  it("announces balance changes and warns when the balance is low", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Nav />);

    expect(
      screen
        .getAllByRole("status", { name: /Баланс/ })
        .every((node) => node.dataset.balanceChange === "idle"),
    ).toBe(true);

    mocks.auth.balance = { balance: "5.00" };
    rerender(<Nav />);

    const balances = screen.getAllByRole("status", { name: /Баланс/ });
    expect(balances.every((node) => node.dataset.balanceChange === "decrease")).toBe(true);
    expect(
      balances.every((node) =>
        within(node).getByText("5.00").className.includes("text-danger"),
      ),
    ).toBe(true);
  });

  it("animates an increase and returns to idle after the animation", () => {
    mocks.auth.balance = null;
    const { rerender } = render(<Nav />);
    expect(screen.getAllByRole("status", { name: "Баланс недоступен" })).toHaveLength(2);

    mocks.auth.balance = { balance: "100.00" };
    rerender(<Nav />);
    mocks.auth.balance = { balance: "125.00" };
    rerender(<Nav />);

    const balances = screen.getAllByRole("status", { name: "Баланс 125.00 кредитов" });
    expect(balances.every((node) => node.dataset.balanceChange === "increase")).toBe(true);
    balances.forEach((node) =>
      fireEvent.animationEnd(within(node).getByText("125.00")),
    );
    expect(balances.every((node) => node.dataset.balanceChange === "idle")).toBe(true);
  });

  it("signs out and returns to login", async () => {
    render(<Nav />);

    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await waitFor(() => expect(mocks.logout).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/login");
  });

  it("does not render navigation without an authenticated user", () => {
    mocks.auth.user = null;

    render(<Nav />);

    expect(screen.queryByRole("banner")).toBeNull();
  });
});
