"use client";

import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import {
  api,
  apiErrorMessage,
  type AgentSummary,
  type AgentDetail,
  type PendingActionEntry,
  type ScheduledAgentRunEntry,
  type TelegramChannelEntry,
} from "@/lib/api";
import { statusPillClass } from "@/lib/status-styles";

export default function AutomationsPage() {
  return (
    <RequireAuth>
      <Automations />
    </RequireAuth>
  );
}

function Automations() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-3 py-8 min-[380px]:px-4 sm:px-6 sm:py-12">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Автоматизации</h1>
        <p className="mt-1 text-sm text-muted">
          Запускайте агентов по расписанию и публикуйте результат в Telegram — публикация
          никогда не уходит без вашего явного подтверждения.
        </p>
      </div>

      <TelegramChannels />
      <Schedules />
      <PendingActions />
    </div>
  );
}

function TelegramChannels() {
  const [channels, setChannels] = useState<TelegramChannelEntry[] | null>(null);
  const [chatId, setChatId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.telegramChannels().then(setChannels, () =>
      setError("Не удалось загрузить каналы.")
    );
  }, []);

  async function connect() {
    const parsed = Number(chatId);
    if (!chatId.trim() || Number.isNaN(parsed) || connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const created = await api.connectTelegramChannel(parsed);
      setChannels((prev) => [created, ...(prev ?? [])]);
      setChatId("");
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось подключить канал."));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect(id: number) {
    try {
      await api.deleteTelegramChannel(id);
      setChannels((prev) => prev?.filter((channel) => channel.id !== id) ?? prev);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось отключить канал."));
    }
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-ink">Каналы Telegram</h2>
      <p className="mt-1 text-sm text-muted">
        Бот должен быть добавлен администратором в канал/чат. Chat ID можно узнать,
        переслав сообщение из канала боту вроде @userinfobot.
      </p>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          placeholder="-1001234567890"
          inputMode="numeric"
          className="input max-w-56"
        />
        <button
          type="button"
          onClick={() => void connect()}
          disabled={connecting || !chatId.trim()}
          className="btn-secondary shrink-0"
        >
          {connecting ? "Подключаем…" : "Подключить"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {channels && channels.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="text-ink">{channel.title}</span>
              <button
                type="button"
                onClick={() => void disconnect(channel.id)}
                className="text-xs text-muted underline hover:text-danger"
              >
                Отключить
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Schedules() {
  const [agents, setAgents] = useState<AgentSummary[] | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentDetail | null>(null);
  const [channels, setChannels] = useState<TelegramChannelEntry[] | null>(null);
  const [schedules, setSchedules] = useState<ScheduledAgentRunEntry[] | null>(null);
  const [input, setInput] = useState<Record<string, string>>({});
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [channelId, setChannelId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.agents().then(setAgents, () => setError("Не удалось загрузить агентов."));
    api.telegramChannels().then(setChannels, () => undefined);
    api.schedules().then(setSchedules, () => setError("Не удалось загрузить расписания."));
  }, []);

  function selectAgent(slug: string) {
    if (!slug) {
      setSelectedAgent(null);
      return;
    }
    api.agent(slug).then((data) => {
      setSelectedAgent(data);
      const next: Record<string, string> = {};
      for (const field of data.input_schema.fields) next[field.key] = field.options?.[0] ?? "";
      setInput(next);
    }, () => setError("Не удалось загрузить форму агента."));
  }

  async function createSchedule() {
    if (!selectedAgent || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createSchedule(
        selectedAgent.slug,
        input,
        hour,
        minute,
        channelId
      );
      setSchedules((prev) => [created, ...(prev ?? [])]);
      setSelectedAgent(null);
      setInput({});
      setChannelId(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось создать расписание."));
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(schedule: ScheduledAgentRunEntry) {
    try {
      const updated = await api.updateSchedule(schedule.id, !schedule.is_active);
      setSchedules(
        (prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? prev
      );
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось изменить расписание."));
    }
  }

  async function deleteSchedule(id: number) {
    try {
      await api.deleteSchedule(id);
      setSchedules((prev) => prev?.filter((item) => item.id !== id) ?? prev);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось удалить расписание."));
    }
  }

  const requiredFilled =
    !selectedAgent ||
    selectedAgent.input_schema.fields.every(
      (field) => !field.required || (input[field.key] ?? "").trim().length > 0
    );

  return (
    <section>
      <h2 className="text-base font-semibold text-ink">Расписания</h2>
      <p className="mt-1 text-sm text-muted">
        Ежедневный запуск агента в указанное время (UTC). Публикация — только с
        подтверждением, ниже в разделе «Ожидают подтверждения».
      </p>

      <div className="mt-3 flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Агент</span>
          <select
            value={selectedAgent?.slug ?? ""}
            onChange={(event) => selectAgent(event.target.value)}
            className="input"
          >
            <option value="">Выберите агента</option>
            {(agents ?? []).map((agent) => (
              <option key={agent.slug} value={agent.slug}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>

        {selectedAgent && (
          <>
            {selectedAgent.input_schema.fields.map((field) => (
              <label key={field.key} className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted">{field.label}</span>
                {field.type === "select" ? (
                  <select
                    value={input[field.key] ?? ""}
                    onChange={(event) =>
                      setInput((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    className="input"
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={input[field.key] ?? ""}
                    maxLength={field.max_length}
                    onChange={(event) =>
                      setInput((prev) => ({ ...prev, [field.key]: event.target.value }))
                    }
                    className="input"
                  />
                )}
              </label>
            ))}

            <div className="flex items-center gap-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted">Час (UTC)</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(event) => setHour(Number(event.target.value))}
                  className="input w-20"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted">Минута</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minute}
                  onChange={(event) => setMinute(Number(event.target.value))}
                  className="input w-20"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">Публиковать черновик в канал (необязательно)</span>
              <select
                value={channelId ?? ""}
                onChange={(event) => setChannelId(Number(event.target.value) || null)}
                className="input"
              >
                <option value="">Не публиковать</option>
                {(channels ?? []).map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    {channel.title}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void createSchedule()}
              disabled={creating || !requiredFilled}
              className="btn-primary self-start"
            >
              {creating ? "Создаём…" : "Создать расписание"}
            </button>
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {schedules && schedules.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate text-ink">
                  {schedule.agent} · {String(schedule.hour).padStart(2, "0")}:
                  {String(schedule.minute).padStart(2, "0")} UTC
                </p>
                <p className="text-xs text-muted">
                  Следующий запуск: {new Date(schedule.next_run_at).toLocaleString()}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => void toggleActive(schedule)}
                  className={`status-pill ${schedule.is_active ? statusPillClass("ok") : statusPillClass("error")}`}
                >
                  {schedule.is_active ? "активно" : "на паузе"}
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSchedule(schedule.id)}
                  className="text-xs text-muted underline hover:text-danger"
                >
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingActions() {
  const [actions, setActions] = useState<PendingActionEntry[] | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.pendingActions().then(
      (data) => {
        setActions(data);
        setDrafts(Object.fromEntries(data.map((item) => [item.id, item.text])));
      },
      () => setError("Не удалось загрузить черновики.")
    );
  }, []);

  function replace(updated: PendingActionEntry) {
    setActions((prev) => prev?.map((item) => (item.id === updated.id ? updated : item)) ?? prev);
  }

  async function saveText(action: PendingActionEntry) {
    const text = drafts[action.id]?.trim();
    if (!text || text === action.text) return;
    setBusyId(action.id);
    setError(null);
    try {
      replace(await api.updatePendingActionText(action.id, text));
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось сохранить текст."));
    } finally {
      setBusyId(null);
    }
  }

  async function confirm(action: PendingActionEntry) {
    setBusyId(action.id);
    setError(null);
    try {
      replace(await api.confirmPendingAction(action.id));
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось подтвердить публикацию."));
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(action: PendingActionEntry) {
    setBusyId(action.id);
    setError(null);
    try {
      replace(await api.cancelPendingAction(action.id));
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось отменить."));
    } finally {
      setBusyId(null);
    }
  }

  const pending = (actions ?? []).filter((action) => action.status === "pending_confirmation");
  const resolved = (actions ?? []).filter((action) => action.status !== "pending_confirmation");

  return (
    <section>
      <h2 className="text-base font-semibold text-ink">Ожидают подтверждения</h2>
      <p className="mt-1 text-sm text-muted">
        Ничего не публикуется без вашего явного подтверждения — отредактируйте текст при
        необходимости перед отправкой.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {pending.length === 0 && actions !== null && (
        <p className="mt-3 text-sm text-muted">Пока нечего подтверждать.</p>
      )}

      <ul className="mt-3 flex flex-col gap-3">
        {pending.map((action) => (
          <li key={action.id} className="rounded-md border border-border bg-surface p-3">
            <textarea
              value={drafts[action.id] ?? ""}
              onChange={(event) =>
                setDrafts((prev) => ({ ...prev, [action.id]: event.target.value }))
              }
              onBlur={() => void saveText(action)}
              rows={4}
              maxLength={8000}
              className="input w-full"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void confirm(action)}
                disabled={busyId === action.id}
                className="btn-primary"
              >
                Подтвердить и опубликовать
              </button>
              <button
                type="button"
                onClick={() => void cancel(action)}
                disabled={busyId === action.id}
                className="btn-secondary"
              >
                Отменить
              </button>
            </div>
          </li>
        ))}
      </ul>

      {resolved.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5">
          {resolved.map((action) => (
            <li
              key={action.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate text-muted">{action.text}</span>
              <span
                role="status"
                className={`status-pill shrink-0 ${statusPillClass(action.status === "sent" ? "ok" : action.status === "failed" ? "error" : "pending")}`}
              >
                {action.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
