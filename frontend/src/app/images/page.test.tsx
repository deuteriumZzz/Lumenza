import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  images: vi.fn(),
  createImage: vi.fn(),
  createImageEdit: vi.fn(),
  refreshBalance: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ refreshBalance: mocks.refreshBalance }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      images: mocks.images,
      createImage: mocks.createImage,
      createImageEdit: mocks.createImageEdit,
    },
  };
});

import { Images } from "@/app/images/page";

describe("Images Mini App layout", () => {
  beforeEach(() => {
    mocks.images.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    mocks.createImage.mockResolvedValue({
      id: 7,
      prompt: "editorial portrait",
      provider: "openai",
      model: "dall-e-3",
      status: "pending",
      credits_charged: 1,
      mocked: false,
      image_url: null,
      source_image_url: null,
      created_at: "2026-08-01T00:00:00Z",
      completed_at: null,
    });
  });

  afterEach(() => {
    cleanup();
    mocks.images.mockReset();
    mocks.refreshBalance.mockReset();
    mocks.createImage.mockReset();
    mocks.createImageEdit.mockReset();
  });

  it("uses a persistent bottom composer with real model routing", async () => {
    render(<Images />);
    await waitFor(() => expect(mocks.images).toHaveBeenCalled());

    expect(screen.getByTestId("images-content").className).toContain(
      "studio-content",
    );
    const composer = screen.getByRole("form", { name: "Image prompt composer" });
    expect(composer.getAttribute("data-placement")).toBe("bottom");

    fireEvent.click(within(composer).getByRole("button", { name: /Модель Image:/ }));
    fireEvent.click(screen.getByRole("button", { name: /DALL·E 3/ }));
    fireEvent.change(within(composer).getByRole("textbox", { name: "Промпт Image" }), {
      target: { value: "editorial portrait" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Создать" }));

    await waitFor(() => expect(mocks.createImage).toHaveBeenCalledWith("editorial portrait", "realistic"));
  });

  it("exposes a central upload action and bottom edit composer in Edit mode", async () => {
    render(<Images initialMode="edit" />);
    await waitFor(() => expect(mocks.images).toHaveBeenCalled());

    expect(screen.getByRole("button", { name: "Загрузить исходное изображение" })).toBeDefined();
    const composer = screen.getByRole("form", { name: "Edit prompt composer" });
    expect(within(composer).getByRole("button", { name: "Добавить референс" })).toHaveProperty("disabled", false);
    expect(within(composer).getByRole("button", { name: "Создать" })).toHaveProperty("disabled", true);
  });

});
