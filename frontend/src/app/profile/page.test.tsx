import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userContext: vi.fn(),
  updateUserContext: vi.fn(),
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api", () => ({
  api: { userContext: mocks.userContext, updateUserContext: mocks.updateUserContext },
  apiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import ProfilePage from "@/app/profile/page";

describe("ProfilePage", () => {
  afterEach(() => {
    cleanup();
    mocks.userContext.mockReset();
    mocks.updateUserContext.mockReset();
  });

  it("loads the saved profile and shows existing values", async () => {
    mocks.userContext.mockResolvedValue({
      data: { general: { tone: "экспертный" }, content: { niche: "фитнес" } },
    });

    render(<ProfilePage />);

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
});
