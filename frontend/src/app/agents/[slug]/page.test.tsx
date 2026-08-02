import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  slug: "threads-content-day",
  agent: vi.fn(),
  createAgentRun: vi.fn(),
  agentRun: vi.fn(),
  refreshBalance: vi.fn(),
  createDocumentExtraction: vi.fn(),
  documentExtraction: vi.fn(),
  telegramChannels: vi.fn(),
  requestPublish: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ slug: mocks.slug }),
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
      agent: mocks.agent,
      createAgentRun: mocks.createAgentRun,
      agentRun: mocks.agentRun,
      createDocumentExtraction: mocks.createDocumentExtraction,
      documentExtraction: mocks.documentExtraction,
      telegramChannels: mocks.telegramChannels,
      requestPublish: mocks.requestPublish,
    },
  };
});

import { ApiError } from "@/lib/api";
import AgentRunPage from "@/app/agents/[slug]/page";

const AGENT_DETAIL = {
  slug: "threads-content-day",
  name: "Контент на день для Threads",
  description: "Соберёт тему, аудиторию, тон и цель.",
  category: "content",
  version: 1,
  input_schema: {
    fields: [
      { key: "topic", label: "Тема", type: "text", required: true, max_length: 200 },
      {
        key: "tone",
        label: "Тон",
        type: "select",
        required: true,
        options: ["дружелюбный", "экспертный"],
      },
    ],
  },
};

const DOCUMENT_SUMMARY_DETAIL = {
  slug: "document-summary",
  name: "Саммари документа",
  description: "Саммари и вопросы по документу.",
  category: "documents",
  version: 1,
  input_schema: {
    fields: [
      {
        key: "document_text",
        label: "Текст документа",
        type: "document_upload",
        required: true,
        max_length: 20000,
      },
      {
        key: "question",
        label: "Что уточнить в документе (необязательно)",
        type: "text",
        required: false,
        max_length: 300,
      },
    ],
  },
};

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    agent: "threads-content-day",
    agent_version: 1,
    status: "pending",
    steps: [{ key: "outline", label: "Продумываем ветки контента", status: "pending" }],
    result: null,
    credits_charged: "0.0000",
    error_message: "",
    created_at: "2026-01-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

describe("AgentRunPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.agent.mockResolvedValue(AGENT_DETAIL);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.slug = "threads-content-day";
    mocks.agent.mockReset();
    mocks.createAgentRun.mockReset();
    mocks.agentRun.mockReset();
    mocks.refreshBalance.mockReset();
    mocks.createDocumentExtraction.mockReset();
    mocks.documentExtraction.mockReset();
    mocks.telegramChannels.mockReset();
    mocks.requestPublish.mockReset();
    sessionStorage.clear();
  });

  it("prefills and consumes a private draft from session storage", async () => {
    sessionStorage.setItem(
      "lumenza:agent-draft:threads-content-day",
      "Конфиденциальный план запуска",
    );

    render(<AgentRunPage />);

    expect(await screen.findByDisplayValue("Конфиденциальный план запуска")).toBeDefined();
    expect(sessionStorage.getItem("lumenza:agent-draft:threads-content-day")).toBeNull();
  });

  it("loads the agent form when private browser storage is unavailable", async () => {
    const storageSpy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Storage blocked", "SecurityError");
    });

    render(<AgentRunPage />);

    expect(await screen.findByLabelText("Тема")).toBeDefined();
    storageSpy.mockRestore();
  });

  it("submits the form and renders step status through to the structured result", async () => {
    mocks.createAgentRun.mockResolvedValue(makeRun());
    mocks.agentRun.mockResolvedValue(
      makeRun({
        status: "ok",
        steps: [{ key: "outline", label: "Продумываем ветки контента", status: "ok" }],
        result: {
          branches: [{ title: "Запуск", angle: "почему сейчас" }],
          hooks: [{ branch: "Запуск", variants: ["Мы это сделали."] }],
          schedule: [
            { time: "09:00", branch: "Запуск", post_text: "Сегодня мы запускаемся." },
          ],
          variants: [],
        },
      }),
    );

    render(<AgentRunPage />);

    // waitFor relies on real timers internally — only switch to fake
    // timers once the initial async load is done and it's time to control
    // the polling interval precisely.
    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), {
      target: { value: "запуск продукта" },
    });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(mocks.createAgentRun).toHaveBeenCalledWith(
      "threads-content-day",
      expect.objectContaining({ topic: "запуск продукта", tone: "дружелюбный" }),
      expect.any(String),
      null,
    );
    expect(screen.getByText("Продумываем ветки контента")).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByText("Запуск").length).toBeGreaterThan(0);
    expect(screen.getByText("Сегодня мы запускаемся.")).toBeDefined();
    expect(screen.getByRole("button", { name: "Опубликовать в Telegram" })).toBeDefined();
  });

  it("passes the composer model preference to the real Agent run API", async () => {
    sessionStorage.setItem("lumenza:agent-model:threads-content-day", "gpt-4o-mini");
    mocks.createAgentRun.mockResolvedValue(makeRun());
    render(<AgentRunPage />);

    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), { target: { value: "запуск" } });
    fireEvent.click(screen.getByRole("button", { name: "Запустить" }));

    await waitFor(() => expect(mocks.createAgentRun).toHaveBeenCalledWith(
      "threads-content-day",
      expect.objectContaining({ topic: "запуск" }),
      expect.any(String),
      null,
      "gpt-4o-mini",
    ));
  });

  it("creates a publish draft with a prefilled, editable text", async () => {
    mocks.createAgentRun.mockResolvedValue(makeRun());
    mocks.agentRun.mockResolvedValue(
      makeRun({
        status: "ok",
        result: {
          branches: [],
          hooks: [],
          schedule: [{ time: "09:00", branch: "Запуск", post_text: "Черновик поста." }],
          variants: [],
        },
      }),
    );
    mocks.telegramChannels.mockResolvedValue([
      { id: 1, chat_id: -100123, title: "Мой канал", connected_at: "" },
    ]);
    mocks.requestPublish.mockResolvedValue({
      id: 9,
      agent_run: 1,
      channel: 1,
      text: "Черновик поста.",
      status: "pending_confirmation",
      error_message: "",
      created_at: "",
      confirmed_at: null,
      sent_at: null,
    });

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), { target: { value: "запуск" } });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.click(screen.getByRole("button", { name: "Опубликовать в Telegram" }));
    await screen.findByText("Мой канал");

    expect(screen.getByDisplayValue("Черновик поста.")).toBeDefined();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Создать черновик" }));

    await waitFor(() =>
      expect(mocks.requestPublish).toHaveBeenCalledWith(1, 1, "Черновик поста."),
    );
    expect(await screen.findByText("Подтвердить публикацию")).toBeDefined();
  });

  it("shows an insufficient-credits message on 402 without advancing past the form", async () => {
    mocks.createAgentRun.mockRejectedValue(
      new ApiError(402, { detail: "Insufficient credits" }),
    );

    render(<AgentRunPage />);

    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), { target: { value: "тема" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByRole("alert").textContent).toBe(
      "Недостаточно кредитов для запуска агента.",
    );
    expect(screen.queryByText("Продумываем ветки контента")).toBeNull();
  });

  it("extracts a document via OCR and fills the document_upload field before submit", async () => {
    mocks.slug = "document-summary";
    mocks.agent.mockResolvedValue(DOCUMENT_SUMMARY_DETAIL);
    mocks.createDocumentExtraction.mockResolvedValue({
      id: 9,
      text: "",
      status: "processing",
      credits_charged: "0.0000",
      mocked: false,
      created_at: "2026-01-01T00:00:00Z",
      completed_at: null,
    });
    mocks.documentExtraction.mockResolvedValue({
      id: 9,
      text: "Договор аренды на 12 месяцев.",
      status: "ok",
      credits_charged: "1.0000",
      mocked: false,
      created_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:05Z",
    });

    const { container } = render(<AgentRunPage />);

    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["scan bytes"], "scan.png", { type: "image/png" });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      // createDocumentExtraction resolves on a microtask.
      await Promise.resolve();
    });

    expect(mocks.createDocumentExtraction).toHaveBeenCalledWith(file);
    // Submit is disabled until the required document_text field is filled —
    // this is the reliable, user-visible signal that extraction landed,
    // rather than reaching into component state directly.
    expect(screen.getByRole("button", { name: "Запустить" })).toHaveProperty("disabled", true);

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Запустить" })).toHaveProperty("disabled", false);
  });

  it("renders the research-digest result shape instead of the Threads plan", async () => {
    mocks.slug = "research-digest";
    mocks.agent.mockResolvedValue({
      slug: "research-digest",
      name: "Дайджест по теме",
      description: "Ищет источники и собирает дайджест.",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "topic", label: "Тема", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue({
      id: 2,
      agent: "research-digest",
      agent_version: 1,
      status: "ok",
      steps: [{ key: "research", label: "Ищем и синтезируем источники", status: "ok" }],
      result: {
        topic: "тренды контент-маркетинга",
        summary: "Короткие форматы продолжают расти.",
        key_points: ["Видео растёт"],
        sources_note: "Источник: example.com",
      },
      credits_charged: "3.0000",
      error_message: "",
      created_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:05Z",
    });

    render(<AgentRunPage />);

    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), {
      target: { value: "тренды контент-маркетинга" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Ключевые выводы")).toBeDefined();
    expect(screen.getByText("Источники")).toBeDefined();
    expect(screen.queryByText("Хуки")).toBeNull();
  });

  it("renders a custom agent's result using its last source agent's renderer, not its own slug", async () => {
    // A "Мои агенты" custom agent (item 10) has a generated slug like
    // "custom-abc123" that matches none of the hardcoded per-slug result
    // components — the dispatch must key off source_agent_slugs[-1] instead.
    mocks.slug = "custom-abc123";
    mocks.agent.mockResolvedValue({
      slug: "custom-abc123",
      name: "Контент + исследования",
      description: "test",
      category: "content",
      version: 1,
      source_agent_slugs: ["threads-content-day", "research-digest"],
      input_schema: {
        fields: [
          { key: "topic", label: "Тема", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue({
      id: 3,
      agent: "custom-abc123",
      agent_version: 1,
      status: "ok",
      steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
      result: {
        topic: "тренды контент-маркетинга",
        summary: "Короткие форматы продолжают расти.",
        key_points: ["Видео растёт"],
        sources_note: "Источник: example.com",
      },
      credits_charged: "3.0000",
      error_message: "",
      created_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:05Z",
    });

    render(<AgentRunPage />);

    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), {
      target: { value: "тренды контент-маркетинга" },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    // The research-digest-shaped result renders correctly...
    expect(screen.getByText("Ключевые выводы")).toBeDefined();
    expect(screen.getByText("Источники")).toBeDefined();
    // ...rather than falling through to the ThreadsContentPlan-typed
    // fallback component, which would render "Хуки"/schedule sections.
    expect(screen.queryByText("Хуки")).toBeNull();
  });

  it("renders the finance-digest result shape, including the fixed disclaimer", async () => {
    mocks.slug = "finance-digest";
    mocks.agent.mockResolvedValue({
      slug: "finance-digest",
      name: "Дайджест рынка",
      description: "Ищет источники и собирает дайджест.",
      category: "finance",
      version: 1,
      input_schema: {
        fields: [
          { key: "topic", label: "Тема или актив", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "finance-digest",
        status: "ok",
        steps: [{ key: "research", label: "Ищем и синтезируем источники", status: "ok" }],
        result: {
          topic: "рынок облигаций РФ",
          summary: "Доходности стабилизировались.",
          key_points: ["Ставка сохранена"],
          disclaimer:
            "Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией.",
          sources_note: "Источник: example.com",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема или актив")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема или актив"), {
      target: { value: "рынок облигаций РФ" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(
      screen.getByText(
        "Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией.",
      ),
    ).toBeDefined();
  });

  it("renders the content-optimizer result shape", async () => {
    mocks.slug = "content-optimizer";
    mocks.agent.mockResolvedValue({
      slug: "content-optimizer",
      name: "Оптимизатор поста",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "post_text", label: "Текст поста", type: "text", required: true, max_length: 4000 },
          {
            key: "platform",
            label: "Платформа",
            type: "select",
            required: true,
            options: ["Threads", "Instagram"],
          },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "content-optimizer",
        status: "ok",
        steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
        result: {
          variants: ["Короткая версия поста."],
          hooks: ["Мы это сделали."],
          feedback: "Сильное открытие.",
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Текст поста")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Текст поста"), {
      target: { value: "Черновик поста" },
    });
    fireEvent.change(screen.getByLabelText("Платформа"), { target: { value: "Threads" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Альтернативные хуки")).toBeDefined();
    expect(screen.getByText("Сильное открытие.")).toBeDefined();
  });

  it("renders the weekly-content-plan result shape", async () => {
    mocks.slug = "weekly-content-plan";
    mocks.agent.mockResolvedValue({
      slug: "weekly-content-plan",
      name: "Недельный контент-план",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "topic", label: "Тема", type: "text", required: true, max_length: 200 },
          { key: "audience", label: "Аудитория", type: "text", required: true, max_length: 200 },
          { key: "platforms", label: "Платформы (через запятую)", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "weekly-content-plan",
        status: "ok",
        steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
        result: {
          days: [
            {
              day_label: "Понедельник",
              platform: "Threads",
              post_text: "Сегодня мы запускаемся.",
              hashtags: ["#запуск"],
            },
          ],
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), { target: { value: "запуск" } });
    fireEvent.change(screen.getByLabelText("Аудитория"), { target: { value: "малый бизнес" } });
    fireEvent.change(screen.getByLabelText("Платформы (через запятую)"), {
      target: { value: "Threads" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Понедельник")).toBeDefined();
    expect(screen.getByText("Сегодня мы запускаемся.")).toBeDefined();
  });

  it("renders the competitor-analysis result shape", async () => {
    mocks.slug = "competitor-analysis";
    mocks.agent.mockResolvedValue({
      slug: "competitor-analysis",
      name: "Конкурентный анализ",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "competitor", label: "Конкурент", type: "text", required: true, max_length: 200 },
          { key: "niche", label: "Ниша", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "competitor-analysis",
        status: "ok",
        steps: [{ key: "research", label: "Ищем и синтезируем источники", status: "ok" }],
        result: {
          competitor: "Acme Corp",
          strengths: ["Известный бренд"],
          weaknesses: ["Высокая цена"],
          opportunities: ["Более простой онбординг"],
          sources_note: "Источник: example.com",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Конкурент")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Конкурент"), { target: { value: "Acme Corp" } });
    fireEvent.change(screen.getByLabelText("Ниша"), { target: { value: "SaaS" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Возможности")).toBeDefined();
    expect(screen.getByText("Более простой онбординг")).toBeDefined();
  });

  it("renders the document-translation result shape", async () => {
    mocks.slug = "document-translation";
    mocks.agent.mockResolvedValue({
      slug: "document-translation",
      name: "Перевод документа",
      description: "test",
      category: "documents",
      version: 1,
      input_schema: {
        fields: [
          {
            key: "document_text",
            label: "Текст документа",
            type: "document_upload",
            required: true,
            max_length: 20000,
          },
          {
            key: "target_language",
            label: "Целевой язык",
            type: "select",
            required: true,
            options: ["English", "Русский"],
          },
        ],
      },
    });
    mocks.createDocumentExtraction.mockResolvedValue({
      id: 10,
      text: "",
      status: "processing",
      credits_charged: "0.0000",
      mocked: false,
      created_at: "2026-01-01T00:00:00Z",
      completed_at: null,
    });
    mocks.documentExtraction.mockResolvedValue({
      id: 10,
      text: "Договор аренды офиса на 12 месяцев.",
      status: "ok",
      credits_charged: "1.0000",
      mocked: false,
      created_at: "2026-01-01T00:00:00Z",
      completed_at: "2026-01-01T00:00:05Z",
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "document-translation",
        status: "ok",
        steps: [{ key: "assemble", label: "Переводим документ", status: "ok" }],
        result: {
          translated_text: "Office lease agreement for 12 months.",
          summary: "A 12-month office lease.",
        },
        credits_charged: "1.5000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["scan bytes"], "scan.png", { type: "image/png" });

    vi.useFakeTimers();
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.change(screen.getByLabelText("Целевой язык"), { target: { value: "English" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Office lease agreement for 12 months.")).toBeDefined();
  });
});
