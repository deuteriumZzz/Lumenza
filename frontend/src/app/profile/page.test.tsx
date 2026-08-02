import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userContext: vi.fn(),
  updateUserContext: vi.fn(),
  updatePet: vi.fn(),
  removePet: vi.fn(),
  user: {
    id: 1,
    username: "alice",
    email: "alice@example.com",
    telegram_linked: false,
    tier: "free" as const,
    pet_name: "Люми",
    pet_image: "/media/pets/lumi.webp",
    pet_preset: "" as const,
    show_pet: true,
  },
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  api: { userContext: mocks.userContext, updateUserContext: mocks.updateUserContext },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
  PET_PRESETS: ["fox", "cat", "robot", "dragon", "rabbit", "blob"],
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    user: mocks.user,
    updatePet: mocks.updatePet,
    removePet: mocks.removePet,
  }),
}));

import ProfilePage from "@/app/profile/page";

describe("ProfilePage", () => {
  afterEach(() => {
    cleanup();
    mocks.userContext.mockReset();
    mocks.updateUserContext.mockReset();
    mocks.updatePet.mockReset();
    mocks.removePet.mockReset();
  });

  it("loads the saved profile and shows existing values", async () => {
    mocks.userContext.mockResolvedValue({
      data: { general: { tone: "экспертный" }, content: { niche: "фитнес" } },
    });

    render(<ProfilePage />);

    const accountNavigation = screen.getByRole("navigation", { name: "Аккаунт" });
    expect(accountNavigation.querySelector('[aria-current="page"]')?.textContent).toContain("Профиль");
    expect(screen.getByRole("region", { name: "Настройки профиля" })).toBeDefined();

    await waitFor(() => expect(screen.getByLabelText("Тон общения")).toBeDefined());
    expect(screen.getByLabelText("Тон общения")).toHaveProperty("value", "экспертный");
    expect(screen.getByLabelText("Ниша")).toHaveProperty("value", "фитнес");
  });

  it("edits a field and saves the full profile shape", async () => {
    mocks.userContext.mockResolvedValue({ data: {} });
    mocks.updateUserContext.mockResolvedValue({ data: {} });

    render(<ProfilePage />);

    await waitFor(() => expect(screen.getByLabelText("Тон общения")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тон общения"), {
      target: { value: "дружелюбный" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    });

    expect(mocks.updateUserContext).toHaveBeenCalledWith(
      expect.objectContaining({
        general: { tone: "дружелюбный", banned_topics: "" },
      }),
    );
    expect(screen.getByText("Сохранено.")).toBeDefined();
  });

  it("loads and saves the finance context block", async () => {
    mocks.userContext.mockResolvedValue({
      data: { finance: { topics: "облигации", risk_profile: "умеренный" } },
    });
    mocks.updateUserContext.mockResolvedValue({ data: {} });

    render(<ProfilePage />);

    await waitFor(() =>
      expect(screen.getByLabelText("Темы/активы, которые интересны")).toBeDefined(),
    );
    expect(screen.getByLabelText("Темы/активы, которые интересны")).toHaveProperty(
      "value",
      "облигации",
    );
    expect(screen.getByLabelText("Риск-профиль")).toHaveProperty("value", "умеренный");

    fireEvent.change(screen.getByLabelText("Риск-профиль"), {
      target: { value: "консервативный" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    });

    expect(mocks.updateUserContext).toHaveBeenCalledWith(
      expect.objectContaining({
        finance: { topics: "облигации", risk_profile: "консервативный" },
      }),
    );
  });

  it("shows the current pet and saves name, image and visibility", async () => {
    mocks.userContext.mockResolvedValue({ data: {} });
    mocks.updatePet.mockResolvedValue({ ...mocks.user, pet_name: "Искорка" });
    render(<ProfilePage />);

    expect(screen.getByRole("heading", { name: "Мой питомец" })).toBeDefined();
    expect(screen.getByAltText("Питомец Люми").getAttribute("src")).toBe(
      "/media/pets/lumi.webp",
    );
    fireEvent.change(screen.getByLabelText("Имя питомца"), {
      target: { value: "Искорка" },
    });
    const file = new File(["pet"], "spark.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Фото питомца"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Показывать питомца в профиле" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить питомца" }));

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith({
        name: "Искорка",
        image: file,
        preset: "",
        show: false,
      }),
    );
  });

  it("rejects unsupported and oversized images before upload", () => {
    mocks.userContext.mockResolvedValue({ data: {} });
    render(<ProfilePage />);

    const unsupported = new File(["text"], "pet.gif", { type: "image/gif" });
    fireEvent.change(screen.getByLabelText("Фото питомца"), {
      target: { files: [unsupported] },
    });
    expect(screen.getByRole("alert").textContent).toContain("JPEG, PNG или WebP");

    const oversized = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "pet.png", {
      type: "image/png",
    });
    fireEvent.change(screen.getByLabelText("Фото питомца"), {
      target: { files: [oversized] },
    });
    expect(screen.getByRole("alert").textContent).toContain("не больше 5 МБ");
    expect(mocks.updatePet).not.toHaveBeenCalled();
  });

  it("lets the user pick a built-in preset companion", async () => {
    mocks.userContext.mockResolvedValue({ data: {} });
    mocks.updatePet.mockResolvedValue({ ...mocks.user, pet_preset: "fox", pet_image: null });
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Лис" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить питомца" }));

    await waitFor(() =>
      expect(mocks.updatePet).toHaveBeenCalledWith({
        name: "Люми",
        image: undefined,
        preset: "fox",
        show: true,
      }),
    );
  });

  it("removes the current pet", async () => {
    mocks.userContext.mockResolvedValue({ data: {} });
    mocks.removePet.mockResolvedValue({
      ...mocks.user,
      pet_name: "",
      pet_image: null,
      show_pet: false,
    });
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole("button", { name: "Удалить питомца" }));

    await waitFor(() => expect(mocks.removePet).toHaveBeenCalled());
  });
});
