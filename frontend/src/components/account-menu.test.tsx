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
    pet_name?: string;
    pet_image?: string | null;
    show_pet?: boolean;
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
import { LocaleProvider } from "@/lib/locale-context";

function renderAccountMenu(ui?: React.ReactNode) {
  return render(
    <LocaleProvider>
      {ui ?? <AccountMenu />}
    </LocaleProvider>,
  );
}

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
    window.localStorage.clear();
    document.documentElement.lang = "ru";
    mocks.push.mockReset();
    mocks.logout.mockReset();
  });

  it("shows who is signed in and their plan/balance at a glance", () => {
    renderAccountMenu();

    expect(screen.getByText("alice")).toBeDefined();
    expect(screen.getByText(/Базовый/)).toBeDefined();
    expect(screen.getByText(/1250 кредитов/)).toBeDefined();
  });

  it("uses the visible pet as the account avatar", () => {
    mocks.user = {
      ...mocks.user!,
      pet_name: "Люми",
      pet_image: "/media/pets/lumi.webp",
      show_pet: true,
    };
    renderAccountMenu();

    expect(screen.getByAltText("Люми").getAttribute("src")).toBe("/media/pets/lumi.webp");
  });

  it("keeps the initial avatar while a pet is hidden", () => {
    mocks.user = {
      ...mocks.user!,
      pet_name: "Люми",
      pet_image: "/media/pets/lumi.webp",
      show_pet: false,
    };
    renderAccountMenu();

    expect(screen.queryByAltText("Люми")).toBeNull();
    expect(screen.getByText("A")).toBeDefined();
  });

  it("opens a menu with plan/credits and sign-out, then closes on outside click", () => {
    renderAccountMenu(
      <div>
        <AccountMenu />
        <button type="button">Outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: /alice/ }));

    const dialog = screen.getByRole("dialog", { name: "Аккаунт" });
    expect(dialog).toBeDefined();
    expect(screen.getByRole("link", { name: /Тариф и кредиты/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Использование/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /Профиль/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Язык/ })).toBeDefined();
    expect(screen.getByRole("link", { name: /О нас/ })).toBeDefined();
    expect(screen.getByRole("button", { name: /Выйти/ })).toBeDefined();

    fireEvent.mouseDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("dialog", { name: "Аккаунт" })).toBeNull();
  });

  it("logs out and redirects to /login", async () => {
    renderAccountMenu();

    fireEvent.click(screen.getByRole("button", { name: /alice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Выйти/ }));

    expect(mocks.logout).toHaveBeenCalled();
    await Promise.resolve();
    expect(mocks.push).toHaveBeenCalledWith("/login");
  });

  it("renders nothing when there is no signed-in user", () => {
    mocks.user = null;
    const { container } = renderAccountMenu();
    expect(container.firstChild).toBeNull();
  });

  it("changes the persisted interface language inline", () => {
    renderAccountMenu();

    fireEvent.click(screen.getByRole("button", { name: /alice/ }));
    fireEvent.click(screen.getByRole("button", { name: /Язык/ }));
    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(document.documentElement.lang).toBe("en");
    expect(window.localStorage.getItem("lumenza:locale")).toBe("en");
  });
});
