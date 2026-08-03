import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  workspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  workspaceSources: vi.fn(),
  addTextSource: vi.fn(),
  addImageSource: vi.fn(),
  searchWorkspace: vi.fn(),
  embedWidgets: vi.fn(),
  createEmbedWidget: vi.fn(),
  setEmbedWidgetActive: vi.fn(),
  deleteEmbedWidget: vi.fn(),
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
      addImageSource: mocks.addImageSource,
      searchWorkspace: mocks.searchWorkspace,
      embedWidgets: mocks.embedWidgets,
      createEmbedWidget: mocks.createEmbedWidget,
      setEmbedWidgetActive: mocks.setEmbedWidgetActive,
      deleteEmbedWidget: mocks.deleteEmbedWidget,
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

const SECOND_WORKSPACE = {
  ...WORKSPACE,
  id: 2,
  name: "Проекты",
};

describe("KnowledgePage", () => {
  beforeEach(() => {
    // Every render of WorkspaceDetail also fetches embed widgets — default
    // to an empty list so existing tests unrelated to widgets don't need
    // to know about this fetch; tests below override it explicitly.
    mocks.embedWidgets.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    mocks.workspaces.mockReset();
    mocks.createWorkspace.mockReset();
    mocks.deleteWorkspace.mockReset();
    mocks.workspaceSources.mockReset();
    mocks.addTextSource.mockReset();
    mocks.addImageSource.mockReset();
    mocks.searchWorkspace.mockReset();
    mocks.embedWidgets.mockReset();
    mocks.createEmbedWidget.mockReset();
    mocks.setEmbedWidgetActive.mockReset();
    mocks.deleteEmbedWidget.mockReset();
  });

  it("renders the knowledge library as a unified source workspace", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([
      {
        id: 5,
        kind: "text",
        status: "ok",
        raw_text: "Lumenza product principles and launch notes.",
        credits_charged: "1.0000",
        error_message: "",
        mocked: false,
        created_at: "2026-01-02T10:00:00Z",
        completed_at: "2026-01-02T10:00:05Z",
      },
    ]);

    render(<KnowledgePage />);

    expect(await screen.findByRole("heading", { name: "Knowledge" })).toBeDefined();
    expect(screen.getByRole("navigation", { name: "Рабочие пространства" })).toBeDefined();
    expect(screen.getByRole("region", { name: "Импорт источника" })).toBeDefined();
    expect(await screen.findByRole("table", { name: "Источники знаний" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Детали источника" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Источник" })).toBeDefined();
    expect(screen.getByRole("columnheader", { name: "Статус" })).toBeDefined();
    expect(screen.getByRole("textbox", { name: "Текст нового источника" })).toBeDefined();
    expect(screen.getByRole("searchbox", { name: "Семантический поиск по пространству" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Фильтр источников: все" }));
    expect(screen.getByRole("button", { name: "Фильтр источников: текст" })).toBeDefined();
    expect(screen.getByRole("row", { name: /Lumenza product principles/i })).toBeDefined();
  });

  it("selects the next workspace after deleting the active one", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE, SECOND_WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.deleteWorkspace.mockResolvedValue(undefined);

    render(<KnowledgePage />);

    await screen.findByRole("button", { name: "Заметки" });
    fireEvent.click(screen.getByRole("button", { name: "Удалить «Заметки»" }));

    await waitFor(() => expect(mocks.deleteWorkspace).toHaveBeenCalledWith(WORKSPACE.id));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Проекты" }).getAttribute("aria-pressed")).toBe("true"),
    );
    expect(mocks.workspaceSources).toHaveBeenCalledWith(SECOND_WORKSPACE.id);
  });

  it("opens a source in the integrated detail panel", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([
      {
        id: 7,
        kind: "image",
        status: "ok",
        raw_text: "Архитектурная схема платформы",
        credits_charged: "2.5000",
        error_message: "",
        mocked: false,
        created_at: "2026-01-03T10:00:00Z",
        completed_at: "2026-01-03T10:00:05Z",
      },
    ]);

    render(<KnowledgePage />);

    const sourceButton = await screen.findByRole("button", { name: "Открыть источник 7" });
    fireEvent.click(sourceButton);

    const detail = screen.getByRole("complementary", { name: "Детали источника" });
    expect(detail.textContent).toContain("Архитектурная схема платформы");
    expect(detail.textContent).toContain("Изображение");
    expect(detail.textContent).toContain("2.5000");
  });

  it("imports an image through the real workspace API", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.addImageSource.mockResolvedValue({
      id: 8,
      kind: "image",
      status: "processing",
      raw_text: "",
      credits_charged: "0.0000",
      error_message: "",
      mocked: false,
      created_at: "2026-01-03T10:00:00Z",
      completed_at: null,
    });

    const { container } = render(<KnowledgePage />);
    await screen.findByRole("region", { name: "Импорт источника" });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(["image"], "diagram.png", { type: "image/png" });
    fireEvent.change(input!, { target: { files: [file] } });

    await waitFor(() => expect(mocks.addImageSource).toHaveBeenCalledWith(WORKSPACE.id, file));
    expect(await screen.findByRole("button", { name: "Открыть источник 8" })).toBeDefined();
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
      await within(screen.getByRole("table", { name: "Источники знаний" })).findByText(
        "Lumenza is a multimodal AI aggregator.",
      ),
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

  it("creates a public embed widget and shows its snippet", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.createEmbedWidget.mockResolvedValue({
      id: 1,
      workspace: WORKSPACE.id,
      public_key: "abc123publickey",
      title: "Support bot",
      is_active: true,
      created_at: "2026-01-01T00:00:00Z",
    });

    render(<KnowledgePage />);

    await waitFor(() => expect(screen.getByLabelText("Название виджета")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Название виджета"), {
      target: { value: "Support bot" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "+ Создать" }));
    });

    expect(mocks.createEmbedWidget).toHaveBeenCalledWith(WORKSPACE.id, "Support bot");
    expect(await screen.findByText("Support bot")).toBeDefined();
    expect(screen.getByText(/abc123publickey/)).toBeDefined();
  });

  it("toggles an embed widget's active state", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.embedWidgets.mockResolvedValue([
      {
        id: 1,
        workspace: WORKSPACE.id,
        public_key: "abc123publickey",
        title: "Support bot",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    mocks.setEmbedWidgetActive.mockResolvedValue({
      id: 1,
      workspace: WORKSPACE.id,
      public_key: "abc123publickey",
      title: "Support bot",
      is_active: false,
      created_at: "2026-01-01T00:00:00Z",
    });

    render(<KnowledgePage />);

    await screen.findByText("Support bot");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Отключить" }));
    });

    expect(mocks.setEmbedWidgetActive).toHaveBeenCalledWith(1, false);
    expect(await screen.findByRole("button", { name: "Включить" })).toBeDefined();
  });

  it("deletes an embed widget", async () => {
    mocks.workspaces.mockResolvedValue([WORKSPACE]);
    mocks.workspaceSources.mockResolvedValue([]);
    mocks.embedWidgets.mockResolvedValue([
      {
        id: 1,
        workspace: WORKSPACE.id,
        public_key: "abc123publickey",
        title: "Support bot",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
    mocks.deleteEmbedWidget.mockResolvedValue(undefined);

    render(<KnowledgePage />);

    await screen.findByText("Support bot");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    });

    expect(mocks.deleteEmbedWidget).toHaveBeenCalledWith(1);
    await waitFor(() => expect(screen.queryByText("Support bot")).toBeNull());
  });
});
