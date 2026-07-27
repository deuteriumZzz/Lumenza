import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  images: vi.fn(),
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
  });

  afterEach(() => {
    cleanup();
    mocks.images.mockReset();
    mocks.refreshBalance.mockReset();
  });

  it("uses responsive controls that stack instead of clipping on narrow screens", async () => {
    render(<Images />);
    await waitFor(() => expect(mocks.images).toHaveBeenCalled());

    expect(screen.getByTestId("images-content").className).toContain(
      "studio-content",
    );
    expect(
      screen.getByRole("group", { name: "Режим работы с картинкой" })
        .className,
    ).toContain("studio-segmented-control");
    expect(
      screen.getByRole("group", { name: "Тип картинки" }).className,
    ).toContain("studio-option-grid");
    expect(screen.getByTestId("images-prompt-row").className).toContain(
      "studio-action-row",
    );
  });
});
