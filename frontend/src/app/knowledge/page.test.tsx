import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  workspaceSources: vi.fn(),
  addTextSource: vi.fn(),
  searchWorkspace: vi.fn(),
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      workspaces: mocks.workspaces,
      createWorkspace: mocks.createWorkspace,
      deleteWorkspace: mocks.deleteWorkspace,
      workspaceSources: mocks.workspaceSources,
      addTextSource: mocks.addTextSource,
      searchWorkspace: mocks.searchWorkspace,
    },
  };
});

import KnowledgePage from "@/app/knowledge/page";

const WORKSPACE = {
  id: 1,
  name: "Заметки",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("KnowledgePage", () => {
  afterEach(() => {
    cleanup();
    mocks.workspaces.mockReset();
    mocks.createWorkspace.mockReset();
    mocks.deleteWorkspace.mockReset();
    mocks.workspaceSources.mockReset();
    mocks.addTextSource.mockReset();
    mocks.searchWorkspace.mockReset();
  });

  it("creates a new workspace and makes it active", async () => {
    mocks.workspaces.mockResolvedValue([]);
    mocks.createWorkspace.mockResolvedValue(WORKSPACE);
    mocks.workspaceSources.mockResolvedValue([]);

    render(<KnowledgePage />);

    await waitFor(() =>
      expect(screen.getByPlaceholderText("Новое рабочее пространство")).toBeDefined(),
    );
    fireEvent.change(screen.getByPlaceholderText("Новое рабочее пространство"), {
      target: { value: "Заметки" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    });

    expect(mocks.createWorkspace).toHaveBeenCalledWith("Заметки");
    expect(await screen.findByRole("button", { name: "Заметки" })).toBeDefined();
  });

  it("adds a text source to the active workspace and lists it", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.addTextSource.mockResolvedValue({
      id: 5,
      kind: "text",
      status: "ok",
      raw_text: "Lumenza is a multimodal AI aggregator.",
      credits_charged: "1.0000",
      error_message: "",
      mocked: true,
      created_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:05Z",
    });

    render(<KnowledgePage />);

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("Вставьте текст, который нужно проиндексировать"),
      ).toBeDefined(),
    );
    fireEvent.change(
      screen.getByPlaceholderText("Вставьте текст, который нужно проиндексировать"),
      { target: { value: "Lumenza is a multimodal AI aggregator." } },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Добавить" }));
    });

    expect(mocks.addTextSource).toHaveBeenCalledWith(
      WORKSPACE.id,
      "Lumenza is a multimodal AI aggregator.",
    );
    expect(
      await screen.findByText("Lumenza is a multimodal AI aggregator."),
    ).toBeDefined();
  });

  it("searches the active workspace and shows matched chunks", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.searchWorkspace.mockResolvedValue([
      { id: 9, text: "Lumenza объединяет чат и поиск.", score: 0.87 },
    ]);

    render(<KnowledgePage />);

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText("О чём спросить это рабочее пространство?"),
      ).toBeDefined(),
    );
    fireEvent.change(
      screen.getByPlaceholderText("О чём спросить это рабочее пространство?"),
      { target: { value: "Что умеет Lumenza?" } },
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    });

    expect(mocks.searchWorkspace).toHaveBeenCalledWith(WORKSPACE.id, "Что умеет Lumenza?");
    expect(await screen.findByText("Lumenza объединяет чат и поиск.")).toBeDefined();
  });
});
