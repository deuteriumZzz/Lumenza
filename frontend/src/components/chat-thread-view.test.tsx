import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setBalance: vi.fn(),
  thread: vi.fn(),
  modelsCatalog: vi.fn(),
  sendThreadMessage: vi.fn(),
  createThread: vi.fn(),
  presets: vi.fn(),
  deletePreset: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ setBalance: mocks.setBalance }),
}));

vi.mock("@/lib/use-polled-status", () => ({
  usePolledStatus: () => undefined,
}));

vi.mock("@/lib/api", () => {
  class ApiError extends Error {
    status: number;
    body: unknown;

    constructor(status: number, body: unknown) {
      super("API error");
      this.status = status;
      this.body = body;
    }
  }

  return {
    ApiError,
    apiErrorMessage: () => "Ошибка",
    api: {
      thread: mocks.thread,
      modelsCatalog: mocks.modelsCatalog,
      sendThreadMessage: mocks.sendThreadMessage,
      createThread: mocks.createThread,
      presets: mocks.presets,
      deletePreset: mocks.deletePreset,
    },
  };
});

import { ChatRoutingProvider } from "@/components/chat-routing";
import { ChatThreadView } from "@/components/chat-thread-view";

const models = [
  {
    task: "repurpose",
    provider: "openai",
    model: "gpt-4o-mini",
    unlocked: true,
    access_class: "standard",
    current_requests: 0,
    target_requests: 0,
    current_days: 0,
    target_days: 0,
  },
  {
    task: "translation",
    provider: "google",
    model: "gemini-1.5-flash",
    unlocked: true,
    access_class: "standard",
    current_requests: 0,
    target_requests: 0,
    current_days: 0,
    target_days: 0,
  },
];

function renderChat() {
  return render(
    <ChatRoutingProvider>
      <ChatThreadView threadId={7} />
    </ChatRoutingProvider>,
  );
}

describe("ChatThreadView model routing", () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.setBalance.mockReset();
    mocks.thread.mockReset().mockResolvedValue({ messages: [] });
    mocks.modelsCatalog.mockReset().mockResolvedValue(models);
    mocks.sendThreadMessage.mockReset().mockResolvedValue({
      text: "Готово",
      provider: "openai",
      model: "gpt-4o-mini",
      task: "repurpose",
      mocked: false,
      used_fallback: false,
      credits_charged: "1.00",
      balance: "99.00",
    });
    mocks.createThread.mockReset().mockResolvedValue({ id: 9 });
    mocks.presets.mockReset().mockResolvedValue([]);
    mocks.deletePreset.mockReset();
  });

  afterEach(cleanup);

  it("presents Lumenza as the place where multiple models converge", async () => {
    renderChat();

    expect(
      await screen.findByRole("img", {
        name: "Lumenza объединяет несколько AI-моделей в один ответ",
      }),
    ).toBeDefined();
    expect(screen.getByText("Модели сходятся здесь")).toBeDefined();
  });

  it("sends an explicit model together with its compatible task", async () => {
    renderChat();

    fireEvent.click(await screen.findByRole("button", { name: "Модель: Автовыбор" }));
    fireEvent.click(await screen.findByRole("button", {
      name: /gpt-4o-mini · openai/i,
    }));

    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
      target: { value: "Сравни два подхода" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(mocks.sendThreadMessage).toHaveBeenCalledWith(
        7,
        "Сравни два подхода",
        "repurpose",
        "gpt-4o-mini",
        undefined,
        undefined,
      ),
    );
    await waitFor(() => expect(mocks.modelsCatalog).toHaveBeenCalledTimes(2));
  });

  it("keeps automatic routing free of task and model overrides", async () => {
    renderChat();

    await screen.findByRole("button", { name: "Модель: Автовыбор" });
    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
      target: { value: "Что можно сделать?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(mocks.sendThreadMessage).toHaveBeenCalledWith(
        7,
        "Что можно сделать?",
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    );
  });

  it("uses a task quick action once and then returns to automatic routing", async () => {
    renderChat();

    fireEvent.click(await screen.findByRole("button", { name: "Исследовать" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
      target: { value: "Свежие новости отрасли" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(mocks.sendThreadMessage).toHaveBeenLastCalledWith(
        7,
        "Свежие новости отрасли",
        "search",
        undefined,
        undefined,
        undefined,
      ),
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
      target: { value: "Теперь обычный вопрос" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(mocks.sendThreadMessage).toHaveBeenLastCalledWith(
        7,
        "Теперь обычный вопрос",
        undefined,
        undefined,
        undefined,
        undefined,
      ),
    );
  });

  it("opens slash commands inside the composer and applies a mode", async () => {
    renderChat();

    const composer = screen.getByRole("textbox", { name: "Сообщение" });
    fireEvent.change(composer, { target: { value: "/" } });

    fireEvent.click(await screen.findByRole("button", { name: /Поиск в интернете/i }));

    expect(screen.getByText("Поиск в интернете", { selector: "[data-active-tool]" })).toBeDefined();
    expect((composer as HTMLTextAreaElement).value).toBe("");
  });

  it("treats the rounded composer as the single visible focus surface", async () => {
    renderChat();

    const composer = await screen.findByRole("form", {
      name: "Написать сообщение",
    });
    const editor = screen.getByRole("textbox", { name: "Сообщение" });

    expect(composer.getAttribute("data-focus-surface")).toBe("composer");
    expect(composer.contains(editor)).toBe(true);
  });

  it("keeps real tools available in an existing chat and supports Command+K", async () => {
    mocks.thread.mockResolvedValueOnce({
      messages: [
        { id: 1, role: "user", text: "Сравни варианты" },
        {
          id: 2,
          role: "assistant",
          text: "Вот сравнение",
          provider: "openai",
          model: "gpt-4o-mini",
          task: "repurpose",
          mocked: false,
          used_fallback: false,
          credits_charged: "1.00",
        },
      ],
    });
    renderChat();

    await screen.findByText("Вот сравнение");
    fireEvent.click(screen.getByRole("button", { name: "Режим" }));
    fireEvent.click(screen.getByRole("button", { name: /Подробный ответ/i }));
    expect(screen.getByText("Подробный ответ", { selector: "[data-active-tool]" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Изображение" }));
    fireEvent.click(screen.getByRole("button", { name: "Документ" }));
    fireEvent.click(screen.getByRole("button", { name: "Анализ" }));
    expect(mocks.push).toHaveBeenCalledWith("/studio");
    expect(mocks.push).toHaveBeenCalledWith("/documents");
    expect(mocks.push).toHaveBeenCalledWith("/analyze");

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(mocks.push).toHaveBeenCalledWith("/chat");
  });

  it("creates a new thread lazily on the first message", async () => {
    render(
      <ChatRoutingProvider>
        <ChatThreadView threadId={null} />
      </ChatRoutingProvider>,
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "Сообщение" }), {
      target: { value: "Начать новый диалог" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => expect(mocks.createThread).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/chat/9"));
  });

  it("sends a preset's system prompt and temperature with the next message", async () => {
    mocks.presets.mockResolvedValue([
      {
        id: 3,
        name: "Дерзкий копирайтер",
        model: "gpt-4o-mini",
        task: "hook",
        system_prompt: "Отвечай дерзко и коротко.",
        temperature: 0.9,
        created_at: "",
        updated_at: "",
      },
    ]);
    renderChat();

    fireEvent.click(await screen.findByRole("button", { name: "Пресет: нет" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Дерзкий копирайтер/ }));

    fireEvent.change(screen.getByRole("textbox", { name: "Сообщение" }), {
      target: { value: "Заголовок для поста" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() =>
      expect(mocks.sendThreadMessage).toHaveBeenCalledWith(
        7,
        "Заголовок для поста",
        "hook",
        "gpt-4o-mini",
        "Отвечай дерзко и коротко.",
        0.9,
      ),
    );
  });

  it("shows a direct microphone permission error", async () => {
    renderChat();

    fireEvent.click(await screen.findByRole("button", { name: /Надиктовать сообщение/i }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Не удалось получить доступ к микрофону",
    );
  });
});
