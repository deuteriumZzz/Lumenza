import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  slug: "threads-content-day",
  agent: vi.fn(),
  createAgentRun: vi.fn(),
  agentRun: vi.fn(),
  refreshBalance: vi.fn(),
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
    },
  };
});

import { ApiError } from "@/lib/api";
import AgentRunPage from "@/app/agents/[slug]/page";

const AGENT_DETAIL = {
  slug: "threads-content-day",
  name: "Контент на день для Threads",
  description: "Соберёт тему, аудиторию, тон и цель.",
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
    mocks.agent.mockResolvedValue(AGENT_DETAIL);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    mocks.agent.mockReset();
    mocks.createAgentRun.mockReset();
    mocks.agentRun.mockReset();
    mocks.refreshBalance.mockReset();
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
    );
    expect(screen.getByText("Продумываем ветки контента")).toBeDefined();

    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getAllByText("Запуск").length).toBeGreaterThan(0);
    expect(screen.getByText("Сегодня мы запускаемся.")).toBeDefined();
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
});
