import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  agents: vi.fn(),
  agent: vi.fn(),
  telegramChannels: vi.fn(),
  connectTelegramChannel: vi.fn(),
  deleteTelegramChannel: vi.fn(),
  schedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
  pendingActions: vi.fn(),
  updatePendingActionText: vi.fn(),
  confirmPendingAction: vi.fn(),
  cancelPendingAction: vi.fn(),
}));

vi.mock("@/components/require-auth", () => ({
  RequireAuth: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: { ...actual.api, ...mocks },
  };
});

import AutomationsPage from "@/app/automations/page";

const AGENT_SUMMARY = [
  { slug: "threads-content-day", name: "Контент на день", description: "", category: "content" },
];

const AGENT_DETAIL = {
  slug: "threads-content-day",
  name: "Контент на день",
  description: "",
  category: "content",
  version: 1,
  input_schema: {
    fields: [{ key: "topic", label: "Тема", type: "text", required: true }],
  },
};

const CHANNEL = { id: 1, chat_id: -100123, title: "Мой канал", connected_at: "" };

const PENDING = {
  id: 5,
  agent_run: 10,
  channel: 1,
  text: "Черновик поста",
  status: "pending_confirmation" as const,
  error_message: "",
  created_at: "",
  confirmed_at: null,
  sent_at: null,
};

describe("AutomationsPage", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((fn) => fn.mockReset());
    mocks.agents.mockResolvedValue(AGENT_SUMMARY);
    mocks.agent.mockResolvedValue(AGENT_DETAIL);
    mocks.telegramChannels.mockResolvedValue([CHANNEL]);
    mocks.schedules.mockResolvedValue([]);
    mocks.pendingActions.mockResolvedValue([PENDING]);
  });

  afterEach(cleanup);

  it("connects a Telegram channel", async () => {
    mocks.connectTelegramChannel.mockResolvedValue({
      id: 2,
      chat_id: -999,
      title: "Новый канал",
      connected_at: "",
    });

    render(<AutomationsPage />);
    await screen.findByText("Мой канал");

    fireEvent.change(screen.getByPlaceholderText("-1001234567890"), {
      target: { value: "-999" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Подключить" }));

    await waitFor(() => expect(mocks.connectTelegramChannel).toHaveBeenCalledWith(-999));
    await screen.findByText("Новый канал");
  });

  it("creates a daily schedule for the selected agent", async () => {
    mocks.createSchedule.mockResolvedValue({
      id: 1,
      agent: "threads-content-day",
      input_payload: { topic: "Запуск" },
      hour: 9,
      minute: 0,
      publish_channel: null,
      is_active: true,
      next_run_at: new Date().toISOString(),
      last_run_at: null,
      last_agent_run: null,
      created_at: "",
    });

    render(<AutomationsPage />);
    await screen.findByText("Мой канал");

    fireEvent.change(screen.getByRole("combobox", { name: "Агент" }), {
      target: { value: "threads-content-day" },
    });
    await waitFor(() => expect(mocks.agent).toHaveBeenCalledWith("threads-content-day"));

    fireEvent.change(await screen.findByLabelText("Тема"), {
      target: { value: "Запуск" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать расписание" }));

    await waitFor(() =>
      expect(mocks.createSchedule).toHaveBeenCalledWith(
        "threads-content-day",
        { topic: "Запуск" },
        9,
        0,
        null,
      ),
    );
  });

  it("confirms a pending action", async () => {
    mocks.confirmPendingAction.mockResolvedValue({ ...PENDING, status: "sent" });

    render(<AutomationsPage />);
    await screen.findByDisplayValue("Черновик поста");

    fireEvent.click(screen.getByRole("button", { name: "Подтвердить и опубликовать" }));

    await waitFor(() => expect(mocks.confirmPendingAction).toHaveBeenCalledWith(5));
  });
});
