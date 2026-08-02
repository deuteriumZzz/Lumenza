import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  telegram: {
    ready: false,
    isMiniApp: false,
    initData: null as string | null,
  },
  telegramAuth: vi.fn(),
  me: vi.fn(),
  balance: vi.fn(),
  updatePet: vi.fn(),
  removePet: vi.fn(),
}));

vi.mock("@/components/telegram-webapp-provider", () => ({
  useTelegramWebApp: () => mocks.telegram,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      telegramAuth: mocks.telegramAuth,
      me: mocks.me,
      balance: mocks.balance,
      updatePet: mocks.updatePet,
      removePet: mocks.removePet,
    },
  };
});

import { AuthProvider, useAuth } from "@/lib/auth-context";

function AuthProbe() {
  const { loading, user, updatePet, removePet } = useAuth();
  return (
    <>
      <output>{loading ? "loading" : user?.pet_name || user?.username || "anonymous"}</output>
      <button type="button" onClick={() => void updatePet({ name: "Люми", show: true })}>
        update pet
      </button>
      <button type="button" onClick={() => void removePet()}>remove pet</button>
    </>
  );
}

describe("AuthProvider Telegram bootstrap", () => {
  afterEach(() => {
    cleanup();
    mocks.telegram.ready = false;
    mocks.telegram.isMiniApp = false;
    mocks.telegram.initData = null;
    mocks.telegramAuth.mockReset();
    mocks.me.mockReset();
    mocks.balance.mockReset();
    mocks.updatePet.mockReset();
    mocks.removePet.mockReset();
  });

  it("waits for Telegram initialization before checking the session", () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByText("loading")).toBeDefined();
    expect(mocks.me).not.toHaveBeenCalled();
    expect(mocks.balance).not.toHaveBeenCalled();
  });

  it("exchanges Mini App initData before loading the shared account", async () => {
    const order: string[] = [];
    mocks.telegram.ready = true;
    mocks.telegram.isMiniApp = true;
    mocks.telegram.initData = "signed-init-data";
    mocks.telegramAuth.mockImplementation(async () => {
      order.push("telegram");
      return { created: false };
    });
    mocks.me.mockImplementation(async () => {
      order.push("me");
      return {
        id: 1,
        username: "telegram-user",
        email: "",
        telegram_linked: true,
        tier: "free",
      };
    });
    mocks.balance.mockImplementation(async () => {
      order.push("balance");
      return { balance: "100", updated_at: "" };
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("telegram-user")).toBeDefined(),
    );
    expect(mocks.telegramAuth).toHaveBeenCalledWith(
      "webapp",
      "signed-init-data",
    );
    expect(order[0]).toBe("telegram");
    expect(order.slice(1).sort()).toEqual(["balance", "me"]);
  });

  it("applies pet updates to the shared user immediately", async () => {
    mocks.telegram.ready = true;
    mocks.me.mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      telegram_linked: false,
      tier: "free",
      pet_name: "",
      pet_image: null,
      show_pet: false,
    });
    mocks.balance.mockResolvedValue({ balance: "100", updated_at: "" });
    mocks.updatePet.mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      telegram_linked: false,
      tier: "free",
      pet_name: "Люми",
      pet_image: "/media/pets/lumi.webp",
      show_pet: true,
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("alice")).toBeDefined());
    screen.getByRole("button", { name: "update pet" }).click();

    await waitFor(() => expect(screen.getByText("Люми")).toBeDefined());
  });

  it("applies pet removal to the shared user immediately", async () => {
    mocks.telegram.ready = true;
    mocks.me.mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      telegram_linked: false,
      tier: "free",
      pet_name: "Люми",
      pet_image: "/media/pets/lumi.webp",
      show_pet: true,
    });
    mocks.balance.mockResolvedValue({ balance: "100", updated_at: "" });
    mocks.removePet.mockResolvedValue({
      id: 1,
      username: "alice",
      email: "alice@example.com",
      telegram_linked: false,
      tier: "free",
      pet_name: "",
      pet_image: null,
      show_pet: false,
    });

    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("Люми")).toBeDefined());
    screen.getByRole("button", { name: "remove pet" }).click();

    await waitFor(() => expect(screen.getByText("alice")).toBeDefined());
  });
});
