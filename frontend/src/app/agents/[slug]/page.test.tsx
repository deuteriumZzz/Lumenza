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

// Shared driver for document_upload-type fields: uploads a file, lets the
// mocked OCR extraction (mocks.createDocumentExtraction/documentExtraction)
// resolve on the polling interval, and fills the required text field.
async function extractDocumentViaOcr(
  container: HTMLElement,
  extractedText: string,
) {
  mocks.createDocumentExtraction.mockResolvedValue({
    id: 99,
    text: "",
    status: "processing",
    credits_charged: "0.0000",
    mocked: false,
    created_at: "2026-01-01T00:00:00Z",
    completed_at: null,
  });
  mocks.documentExtraction.mockResolvedValue({
    id: 99,
    text: extractedText,
    status: "ok",
    credits_charged: "1.0000",
    mocked: false,
    created_at: "2026-01-01T00:00:00Z",
    completed_at: "2026-01-01T00:00:05Z",
  });

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

  it("renders the linkedin-outreach result shape", async () => {
    mocks.slug = "linkedin-outreach";
    mocks.agent.mockResolvedValue({
      slug: "linkedin-outreach",
      name: "LinkedIn-аутрич",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "target", label: "Кому пишете (роль, компания)", type: "text", required: true, max_length: 200 },
          { key: "context", label: "Повод для контакта", type: "text", required: true, max_length: 300 },
          { key: "tone", label: "Тон", type: "select", required: true, options: ["дружелюбный", "формальный"] },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "linkedin-outreach",
        status: "ok",
        steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
        result: {
          opening_lines: ["Заметил ваш пост —"],
          message: "Добрый день!",
          follow_up: "Через неделю: напоминание.",
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Кому пишете (роль, компания)")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Кому пишете (роль, компания)"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Повод для контакта"), { target: { value: "нетворкинг" } });
    fireEvent.change(screen.getByLabelText("Тон"), { target: { value: "дружелюбный" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Через неделю: напоминание.")).toBeDefined();
  });

  it("renders the twitter-content-engine result shape", async () => {
    mocks.slug = "twitter-content-engine";
    mocks.agent.mockResolvedValue({
      slug: "twitter-content-engine",
      name: "X/Twitter контент-движок",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "niche", label: "Ниша/тема аккаунта", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "twitter-content-engine",
        status: "ok",
        steps: [{ key: "research", label: "Ищем", status: "ok" }],
        result: {
          trending_topics: ["Тайм-блокинг"],
          tweets: ["Секрет продуктивности."],
          thread_idea: "5 привычек.",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Ниша/тема аккаунта")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Ниша/тема аккаунта"), { target: { value: "продуктивность" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("5 привычек.")).toBeDefined();
  });

  it("renders the blog-post-generator result shape", async () => {
    mocks.slug = "blog-post-generator";
    mocks.agent.mockResolvedValue({
      slug: "blog-post-generator",
      name: "Генератор блог-поста",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "topic", label: "Тема", type: "text", required: true, max_length: 200 },
          { key: "audience", label: "Аудитория", type: "text", required: true, max_length: 200 },
          { key: "tone", label: "Тон", type: "select", required: true, options: ["экспертный", "разговорный"] },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "blog-post-generator",
        status: "ok",
        steps: [{ key: "draft", label: "Пишем", status: "ok" }],
        result: {
          title: "Как управлять командой",
          sections: [{ heading: "Введение", body: "Текст." }],
          summary: "Резюме статьи.",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), { target: { value: "удалённая работа" } });
    fireEvent.change(screen.getByLabelText("Аудитория"), { target: { value: "менеджеры" } });
    fireEvent.change(screen.getByLabelText("Тон"), { target: { value: "экспертный" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Как управлять командой")).toBeDefined();
  });

  it("renders the offer-letter-drafter result shape", async () => {
    mocks.slug = "offer-letter-drafter";
    mocks.agent.mockResolvedValue({
      slug: "offer-letter-drafter",
      name: "Оффер-письмо",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "candidate_name", label: "Имя кандидата", type: "text", required: true, max_length: 120 },
          { key: "role", label: "Должность", type: "text", required: true, max_length: 150 },
          { key: "key_terms", label: "Ключевые условия (оклад, дата начала, формат)", type: "text", required: true, max_length: 500 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "offer-letter-drafter",
        status: "ok",
        steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
        result: {
          offer_letter_text: "Уважаемый Иван!",
          key_terms: ["Оклад 250000"],
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Имя кандидата")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Имя кандидата"), { target: { value: "Иван" } });
    fireEvent.change(screen.getByLabelText("Должность"), { target: { value: "Engineer" } });
    fireEvent.change(screen.getByLabelText("Ключевые условия (оклад, дата начала, формат)"), {
      target: { value: "250000" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Уважаемый Иван!")).toBeDefined();
  });

  it("renders the recipe-creator result shape", async () => {
    mocks.slug = "recipe-creator";
    mocks.agent.mockResolvedValue({
      slug: "recipe-creator",
      name: "Генератор рецептов",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "theme_or_ingredients", label: "Тема или ингредиенты", type: "text", required: true, max_length: 300 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "recipe-creator",
        status: "ok",
        steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
        result: {
          title: "Летний салат",
          ingredients: ["Курица"],
          steps: ["Обжарить курицу"],
          intro_text: "Лёгкий ужин.",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема или ингредиенты")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема или ингредиенты"), { target: { value: "курица" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Летний салат")).toBeDefined();
  });

  it("renders the support-reply-drafter result shape", async () => {
    mocks.slug = "support-reply-drafter";
    mocks.agent.mockResolvedValue({
      slug: "support-reply-drafter",
      name: "Ответ в поддержку",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "customer_message", label: "Сообщение клиента", type: "text", required: true, max_length: 2000 },
          { key: "context", label: "Контекст (что нужно знать для ответа)", type: "text", required: false, max_length: 1000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "support-reply-drafter",
        status: "ok",
        steps: [{ key: "assemble", label: "Собираем", status: "ok" }],
        result: { reply_text: "Приносим извинения.", tone_note: "Извиняющийся тон." },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Сообщение клиента")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Сообщение клиента"), { target: { value: "Где заказ?" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Приносим извинения.")).toBeDefined();
  });

  it("renders the audience-sentiment result shape", async () => {
    mocks.slug = "audience-sentiment";
    mocks.agent.mockResolvedValue({
      slug: "audience-sentiment",
      name: "Анализ тона аудитории",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "topic_or_brand", label: "Тема или бренд", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "audience-sentiment",
        status: "ok",
        steps: [{ key: "research", label: "Ищем", status: "ok" }],
        result: {
          overall_sentiment: "Преимущественно позитивный",
          themes: ["Камера хвалят"],
          notable_mentions: ["YouTube-обзор"],
          sources_note: "Источник: example.com",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема или бренд")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема или бренд"), { target: { value: "iPhone" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Преимущественно позитивный")).toBeDefined();
  });

  it("renders the research-report result shape", async () => {
    mocks.slug = "research-report";
    mocks.agent.mockResolvedValue({
      slug: "research-report",
      name: "Аналитический отчёт",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "topic", label: "Тема", type: "text", required: true, max_length: 200 },
          { key: "audience", label: "Для кого отчёт", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "research-report",
        status: "ok",
        steps: [{ key: "research", label: "Ищем", status: "ok" }],
        result: {
          title: "Будущее удалённой работы",
          sections: [{ heading: "Текущее состояние", body: "Текст." }],
          key_takeaways: ["Гибрид — норма."],
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Тема"), { target: { value: "удалённая работа" } });
    fireEvent.change(screen.getByLabelText("Для кого отчёт"), { target: { value: "HR" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Гибрид — норма.")).toBeDefined();
  });

  it("renders the invoice-data-extractor result shape", async () => {
    mocks.slug = "invoice-data-extractor";
    mocks.agent.mockResolvedValue({
      slug: "invoice-data-extractor",
      name: "Извлечение данных из счёта",
      description: "test",
      category: "documents",
      version: 1,
      input_schema: {
        fields: [
          { key: "document_text", label: "Текст счёта", type: "document_upload", required: true, max_length: 20000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "invoice-data-extractor",
        status: "ok",
        steps: [{ key: "extract", label: "Извлекаем", status: "ok" }],
        result: {
          vendor: "ООО Ромашка",
          amount: "15000 руб.",
          due_date: "10.09.2026",
          line_items: ["Консультационные услуги"],
        },
        credits_charged: "3.0000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());
    await extractDocumentViaOcr(container, "Счёт №123 от ООО Ромашка.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("ООО Ромашка")).toBeDefined();
  });

  it("renders the rfp-response-drafter result shape", async () => {
    mocks.slug = "rfp-response-drafter";
    mocks.agent.mockResolvedValue({
      slug: "rfp-response-drafter",
      name: "Ответ на RFP",
      description: "test",
      category: "documents",
      version: 1,
      input_schema: {
        fields: [
          { key: "document_text", label: "Текст RFP", type: "document_upload", required: true, max_length: 20000 },
          { key: "company_context", label: "О вашей компании (для ответа)", type: "text", required: true, max_length: 1000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "rfp-response-drafter",
        status: "ok",
        steps: [{ key: "draft", label: "Готовим", status: "ok" }],
        result: {
          responses: [{ question: "Опишите опыт.", answer: "5 лет опыта." }],
          summary: "Готовая заявка.",
        },
        credits_charged: "3.0000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());
    await extractDocumentViaOcr(container, "1. Опишите ваш опыт.");

    fireEvent.change(screen.getByLabelText("О вашей компании (для ответа)"), {
      target: { value: "Команда из 10 разработчиков." },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Готовая заявка.")).toBeDefined();
  });

  it("renders the resume-job-matcher result shape", async () => {
    mocks.slug = "resume-job-matcher";
    mocks.agent.mockResolvedValue({
      slug: "resume-job-matcher",
      name: "Анализ резюме",
      description: "test",
      category: "documents",
      version: 1,
      input_schema: {
        fields: [
          { key: "resume_text", label: "Текст резюме", type: "document_upload", required: true, max_length: 20000 },
          { key: "job_description", label: "Описание вакансии (необязательно)", type: "text", required: false, max_length: 3000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "resume-job-matcher",
        status: "ok",
        steps: [{ key: "analyze", label: "Анализируем", status: "ok" }],
        result: {
          strengths: ["Сильный опыт в Python"],
          gaps: ["Нет опыта с Kubernetes"],
          tailored_summary: "Опытный разработчик.",
        },
        credits_charged: "3.0000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());
    await extractDocumentViaOcr(container, "5 лет опыта в Python.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Нет опыта с Kubernetes")).toBeDefined();
  });

  it("renders the contract-analyzer result shape", async () => {
    mocks.slug = "contract-analyzer";
    mocks.agent.mockResolvedValue({
      slug: "contract-analyzer",
      name: "Анализ договора",
      description: "test",
      category: "documents",
      version: 1,
      input_schema: {
        fields: [
          { key: "document_text", label: "Текст договора", type: "document_upload", required: true, max_length: 20000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "contract-analyzer",
        status: "ok",
        steps: [{ key: "analyze", label: "Анализируем", status: "ok" }],
        result: {
          summary: "Договор на 1 год.",
          key_terms: ["Срок 1 год"],
          risks: ["Нет пункта о расторжении"],
          recommendations: ["Добавить пункт"],
        },
        credits_charged: "3.0000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());
    await extractDocumentViaOcr(container, "Договор оказания услуг.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Нет пункта о расторжении")).toBeDefined();
  });

  it("renders the market-research result shape", async () => {
    mocks.slug = "market-research";
    mocks.agent.mockResolvedValue({
      slug: "market-research",
      name: "Исследование рынка",
      description: "test",
      category: "finance",
      version: 1,
      input_schema: {
        fields: [
          { key: "sector_or_theme", label: "Сектор или тема", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "market-research",
        status: "ok",
        steps: [{ key: "research", label: "Ищем", status: "ok" }],
        result: {
          theme: "рынок электромобилей",
          trends: ["Рост спроса"],
          key_players: ["Tesla", "BYD"],
          disclaimer: "Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией.",
          sources_note: "Источник: example.com",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Сектор или тема")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Сектор или тема"), { target: { value: "электромобили" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Tesla")).toBeDefined();
  });

  it("renders the financial-report-analyzer result shape", async () => {
    mocks.slug = "financial-report-analyzer";
    mocks.agent.mockResolvedValue({
      slug: "financial-report-analyzer",
      name: "Анализ финансового отчёта",
      description: "test",
      category: "finance",
      version: 1,
      input_schema: {
        fields: [
          { key: "document_text", label: "Текст финансового отчёта", type: "document_upload", required: true, max_length: 20000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "financial-report-analyzer",
        status: "ok",
        steps: [{ key: "analyze", label: "Анализируем", status: "ok" }],
        result: {
          summary: "Выручка растёт.",
          key_metrics: ["Выручка +12%"],
          red_flags: ["Снижение прибыли"],
          disclaimer: "Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией.",
        },
        credits_charged: "3.0000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByText("Загрузить документ")).toBeDefined());
    await extractDocumentViaOcr(container, "Выручка выросла на 12%.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Снижение прибыли")).toBeDefined();
  });

  it("renders the investment-research result shape", async () => {
    mocks.slug = "investment-research";
    mocks.agent.mockResolvedValue({
      slug: "investment-research",
      name: "Инвестиционное исследование",
      description: "test",
      category: "finance",
      version: 1,
      input_schema: {
        fields: [
          { key: "asset", label: "Актив", type: "text", required: true, max_length: 200 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "investment-research",
        status: "ok",
        steps: [{ key: "research", label: "Ищем", status: "ok" }],
        result: {
          asset: "индекс S&P 500",
          thesis: "Долгосрочный рост.",
          risks: ["Волатильность ставок"],
          disclaimer: "Материал носит информационный характер и не является индивидуальной инвестиционной рекомендацией.",
          sources_note: "Источник: example.com",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Актив")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Актив"), { target: { value: "S&P 500" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Волатильность ставок")).toBeDefined();
  });

  it("renders the data-quick-check result shape", async () => {
    mocks.slug = "data-quick-check";
    mocks.agent.mockResolvedValue({
      slug: "data-quick-check",
      name: "Быстрая проверка данных",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "question", label: "Вопрос", type: "text", required: true, max_length: 300 },
          { key: "data", label: "Данные", type: "text", required: true, max_length: 4000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "data-quick-check",
        status: "ok",
        steps: [
          { key: "write_code", label: "Пишем скрипт", status: "ok" },
          { key: "run_code", label: "Выполняем скрипт", status: "ok", stdout: "18.0\n", stderr: "", exit_code: 0 },
          { key: "assemble", label: "Объясняем", status: "ok" },
        ],
        result: {
          question: "Какое среднее у чисел 4, 8, 15, 16, 23, 42?",
          code_stdout: "18.0\n",
          explanation: "Среднее равно 18.",
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Вопрос")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Вопрос"), { target: { value: "Среднее?" } });
    fireEvent.change(screen.getByLabelText("Данные"), { target: { value: "4, 8, 15" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Среднее равно 18.")).toBeDefined();
    // The live step transcript also shows the real stdout for the code step.
    expect(screen.getAllByText("18.0").length).toBeGreaterThan(0);
  });

  it("renders the video-teaser-generator result shape with a real video/gif element", async () => {
    mocks.slug = "video-teaser-generator";
    mocks.agent.mockResolvedValue({
      slug: "video-teaser-generator",
      name: "Генератор видео-тизера",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "brief", label: "Идея ролика", type: "text", required: true, max_length: 500 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "video-teaser-generator",
        status: "ok",
        steps: [
          { key: "write_prompt", label: "Составляем промпт", status: "ok" },
          { key: "generate_video", label: "Генерируем видео", status: "ok", video_url: "/media/generated_videos/1.gif" },
          { key: "assemble", label: "Пишем подпись", status: "ok" },
        ],
        result: {
          caption: "Просыпайся с новым вкусом.",
          video_url: "/media/generated_videos/1.gif",
        },
        credits_charged: "4.5000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Идея ролика")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Идея ролика"), { target: { value: "тизер для кофе" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Просыпайся с новым вкусом.")).toBeDefined();
    // Mocked output is a .gif -> rendered as <img>, not <video>.
    expect(container.querySelectorAll('img[src="/media/generated_videos/1.gif"]').length).toBeGreaterThan(0);
    // The live step transcript renders the raw video_url as a real <video>.
    expect(container.querySelector('video[src="/media/generated_videos/1.gif"]')).not.toBeNull();
  });

  it("renders the code-review-agent result shape", async () => {
    mocks.slug = "code-review-agent";
    mocks.agent.mockResolvedValue({
      slug: "code-review-agent",
      name: "Обзор кода",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "code", label: "Код для обзора", type: "text", required: true, max_length: 4000 },
          { key: "language", label: "Язык", type: "select", required: true, options: ["Python"] },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "code-review-agent",
        status: "ok",
        steps: [
          { key: "review", label: "Анализируем код", status: "ok" },
          { key: "assemble", label: "Собираем итоговый обзор", status: "ok" },
        ],
        result: {
          issues: [{ severity: "low", description: "Нет аннотаций типов." }],
          suggestions: ["Добавить type hints."],
          summary: "Код рабочий, но можно улучшить читаемость.",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Код для обзора")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Код для обзора"), { target: { value: "def add(a, b): return a+b" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Код рабочий, но можно улучшить читаемость.")).toBeDefined();
    expect(screen.getByText("Нет аннотаций типов.")).toBeDefined();
  });

  it("renders the python-test-writer result shape with real code_stdout", async () => {
    mocks.slug = "python-test-writer";
    mocks.agent.mockResolvedValue({
      slug: "python-test-writer",
      name: "Генератор и запуск юнит-тестов",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "code", label: "Python-функция или модуль для тестирования", type: "text", required: true, max_length: 4000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "python-test-writer",
        status: "ok",
        steps: [
          { key: "write_tests", label: "Пишем тесты", status: "ok" },
          { key: "run_tests", label: "Запускаем тесты", status: "ok", stdout: "Ran 1 test in 0.000s\n\nOK\n", stderr: "", exit_code: 0 },
          { key: "assemble", label: "Собираем итоговый отчёт", status: "ok" },
        ],
        result: {
          test_code: "def add(a, b):\n    return a + b",
          code_stdout: "Ran 1 test in 0.000s\n\nOK\n",
          summary: "Все тесты прошли успешно.",
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() =>
      expect(screen.getByLabelText("Python-функция или модуль для тестирования")).toBeDefined()
    );
    fireEvent.change(screen.getByLabelText("Python-функция или модуль для тестирования"), {
      target: { value: "def add(a, b):\n    return a + b" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Все тесты прошли успешно.")).toBeDefined();
    expect(screen.getAllByText(/Ran 1 test in 0\.000s/).length).toBeGreaterThan(0);
  });

  it("renders the product-demo-video result via the shared video-teaser component", async () => {
    mocks.slug = "product-demo-video";
    mocks.agent.mockResolvedValue({
      slug: "product-demo-video",
      name: "Демо-видео продукта",
      description: "test",
      category: "content",
      version: 1,
      input_schema: {
        fields: [
          { key: "product_description", label: "Что показать в демо", type: "text", required: true, max_length: 500 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "product-demo-video",
        status: "ok",
        steps: [
          { key: "write_prompt", label: "Составляем промпт", status: "ok" },
          { key: "generate_video", label: "Генерируем видео", status: "ok", video_url: "/media/generated_videos/2.gif" },
          { key: "assemble", label: "Пишем подпись", status: "ok" },
        ],
        result: {
          caption: "Постройте полезные привычки шаг за шагом.",
          video_url: "/media/generated_videos/2.gif",
        },
        credits_charged: "4.5000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Что показать в демо")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Что показать в демо"), { target: { value: "трекер привычек" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Постройте полезные привычки шаг за шагом.")).toBeDefined();
    expect(container.querySelectorAll('img[src="/media/generated_videos/2.gif"]').length).toBeGreaterThan(0);
  });

  it("renders the podcast-summary result shape with a real audio element", async () => {
    mocks.slug = "podcast-summary";
    mocks.agent.mockResolvedValue({
      slug: "podcast-summary",
      name: "Подкаст из текста",
      description: "test",
      category: "audio",
      version: 1,
      input_schema: {
        fields: [
          { key: "article_text", label: "Текст статьи или материала", type: "text", required: true, max_length: 4000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "podcast-summary",
        status: "ok",
        steps: [
          { key: "write_script", label: "Пишем сценарий подкаста", status: "ok" },
          { key: "generate_audio", label: "Озвучиваем подкаст", status: "ok", audio_url: "/media/speech_clips/1.mp3" },
          { key: "assemble", label: "Пишем описание эпизода", status: "ok" },
        ],
        result: {
          title: "Пластик и ферменты",
          audio_url: "/media/speech_clips/1.mp3",
          description: "Короткий разбор новой технологии переработки.",
        },
        credits_charged: "4.5000",
      }),
    );

    const { container } = render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Текст статьи или материала")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Текст статьи или материала"), { target: { value: "статья про ферменты" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Короткий разбор новой технологии переработки.")).toBeDefined();
    // The live step transcript and the final result both render a real <audio>.
    expect(container.querySelectorAll('audio[src="/media/speech_clips/1.mp3"]').length).toBeGreaterThan(1);
  });

  it("renders the audio-ad-creator result shape", async () => {
    mocks.slug = "audio-ad-creator";
    mocks.agent.mockResolvedValue({
      slug: "audio-ad-creator",
      name: "Аудио-реклама",
      description: "test",
      category: "audio",
      version: 1,
      input_schema: {
        fields: [
          { key: "product_description", label: "Продукт или услуга для рекламы", type: "text", required: true, max_length: 500 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "audio-ad-creator",
        status: "ok",
        steps: [
          { key: "write_script", label: "Пишем рекламный сценарий", status: "ok" },
          { key: "generate_audio", label: "Озвучиваем ролик", status: "ok", audio_url: "/media/speech_clips/2.mp3" },
          { key: "assemble", label: "Пишем описание ролика", status: "ok" },
        ],
        result: {
          script: "Хочешь новых привычек? Скачай наше приложение!",
          audio_url: "/media/speech_clips/2.mp3",
          caption: "Реклама приложения-трекера привычек.",
        },
        credits_charged: "4.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Продукт или услуга для рекламы")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Продукт или услуга для рекламы"), { target: { value: "трекер привычек" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Хочешь новых привычек? Скачай наше приложение!")).toBeDefined();
    expect(screen.getByText("Реклама приложения-трекера привычек.")).toBeDefined();
  });

  it("renders the travel-itinerary-planner result shape", async () => {
    mocks.slug = "travel-itinerary-planner";
    mocks.agent.mockResolvedValue({
      slug: "travel-itinerary-planner",
      name: "Тревел-планировщик",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "destination", label: "Направление поездки", type: "text", required: true, max_length: 200 },
          { key: "trip_details", label: "Длительность, бюджет и интересы", type: "text", required: true, max_length: 500 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "travel-itinerary-planner",
        status: "ok",
        steps: [
          { key: "research_destination", label: "Изучаем направление", status: "ok" },
          { key: "assemble", label: "Собираем маршрут по дням", status: "ok" },
        ],
        result: {
          destination: "Токио",
          itinerary: [{ day_label: "День 1", activities: ["Сэнсодзи", "Асакуса"] }],
          budget_note: "Средний бюджет позволяет 2-3 приёма пищи в день вне дома.",
        },
        credits_charged: "3.0000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Направление поездки")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Направление поездки"), { target: { value: "Токио" } });
    fireEvent.change(screen.getByLabelText("Длительность, бюджет и интересы"), { target: { value: "5 дней" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("День 1")).toBeDefined();
    expect(screen.getByText("Сэнсодзи")).toBeDefined();
  });

  it("renders the review-sentiment-classifier result shape", async () => {
    mocks.slug = "review-sentiment-classifier";
    mocks.agent.mockResolvedValue({
      slug: "review-sentiment-classifier",
      name: "Классификатор тональности отзывов",
      description: "test",
      category: "research",
      version: 1,
      input_schema: {
        fields: [
          { key: "reviews_text", label: "Отзывы клиентов (по одному на строку)", type: "text", required: true, max_length: 4000 },
        ],
      },
    });
    mocks.createAgentRun.mockResolvedValue(
      makeRun({
        agent: "review-sentiment-classifier",
        status: "ok",
        steps: [{ key: "assemble", label: "Классифицируем отзывы", status: "ok" }],
        result: {
          classified_reviews: [
            {
              review_snippet: "Отличный сервис, быстро доставили!",
              sentiment: "позитивная",
              urgency: "низкая",
              reason: "Довольный клиент, без жалоб.",
            },
          ],
          overall_summary: "Один довольный отзыв.",
        },
        credits_charged: "1.5000",
      }),
    );

    render(<AgentRunPage />);
    await waitFor(() => expect(screen.getByLabelText("Отзывы клиентов (по одному на строку)")).toBeDefined());
    fireEvent.change(screen.getByLabelText("Отзывы клиентов (по одному на строку)"), { target: { value: "Отличный сервис!" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Запустить" }));
    });

    expect(screen.getByText("Отличный сервис, быстро доставили!")).toBeDefined();
    expect(screen.getByText("Один довольный отзыв.")).toBeDefined();
  });
});
