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
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12">
      <header
        data-testid="workspace-page-header"
        className="flex flex-col gap-6 border-b border-border/70 pb-8 md:flex-row md:items-end md:justify-between"
      >
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
            Агентные процессы
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
            Автоматизации
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
            Запускайте агентов по расписанию и публикуйте результат в Telegram — публикация
            никогда не уходит без вашего явного подтверждения.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="size-2 rounded-full bg-primary shadow-[0_0_14px_var(--color-primary)]" />
          Расписание работает по UTC
        </div>
      </header>

      <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(17rem,0.78fr)_minmax(0,1.55fr)]">
        <TelegramChannels />
        <Schedules />
      </div>
      <div className="mt-6">
        <PendingActions />
      </div>
    </section>
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
    <section
      aria-label="Каналы Telegram"
      className="rounded-2xl border border-border/70 bg-surface/60 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Доставка</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">Каналы Telegram</h2>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted">
          {channels === null ? "—" : channels.length}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-muted">
        Бот должен быть добавлен администратором в канал/чат. Chat ID можно узнать,
        переслав сообщение из канала боту вроде @userinfobot.
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={chatId}
          onChange={(event) => setChatId(event.target.value)}
          placeholder="-1001234567890"
          inputMode="numeric"
          aria-label="Chat ID Telegram"
          className="input min-w-0 flex-1"
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
        <ul className="mt-5 flex flex-col divide-y divide-border/60 border-y border-border/60">
          {channels.map((channel) => (
            <li
              key={channel.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
            >
              <span className="text-ink">{channel.title}</span>
              <button
                type="button"
                onClick={() => void disconnect(channel.id)}
                className="rounded px-1 py-1 text-xs text-muted transition-colors duration-200 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
    <section
      aria-label="Расписания"
      className="rounded-2xl border border-border/70 bg-surface/60 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Оркестрация</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">Расписания</h2>
        </div>
        <span className="font-mono text-xs tabular-nums text-muted">
          {schedules === null ? "—" : schedules.length}
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Ежедневный запуск агента в указанное время (UTC). Публикация — только с
        подтверждением, ниже в разделе «Ожидают подтверждения».
      </p>

      <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border/70 bg-bg/35 p-4 sm:p-5">
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

            <div className="grid max-w-sm grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted">Час (UTC)</span>
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  onChange={(event) => setHour(Number(event.target.value))}
                  className="input w-full"
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
                  className="input w-full"
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
        <ul className="mt-5 flex flex-col divide-y divide-border/60 border-y border-border/60">
          {schedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex flex-col gap-3 py-3.5 text-sm sm:flex-row sm:items-center sm:justify-between"
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
                  className="rounded px-1 py-1 text-xs text-muted transition-colors duration-200 hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
    <section
      aria-label="Ожидают подтверждения"
      className="rounded-2xl border border-border/70 bg-surface/60 p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-primary">Контроль публикаций</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">Ожидают подтверждения</h2>
        </div>
        <p className="font-mono text-xs tabular-nums text-muted">{pending.length} в очереди</p>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
        Ничего не публикуется без вашего явного подтверждения — отредактируйте текст при
        необходимости перед отправкой.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      {pending.length === 0 && actions !== null && (
        <div className="mt-5 rounded-xl border border-dashed border-border/80 bg-bg/25 px-5 py-8 text-center text-sm text-muted">
          Пока нечего подтверждать.
        </div>
      )}

      <ul className="mt-5 flex flex-col gap-3">
        {pending.map((action) => (
          <li key={action.id} className="rounded-xl border border-primary/20 bg-bg/35 p-4">
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
            <div className="mt-3 flex flex-wrap items-center gap-2">
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
        <ul className="mt-5 flex flex-col divide-y divide-border/60 border-y border-border/60">
          {resolved.map((action) => (
            <li
              key={action.id}
              className="flex items-center justify-between gap-3 py-3 text-sm"
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
