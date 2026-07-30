"use client";

import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type ModelProgress, type Preset, type Task } from "@/lib/api";
import { TASK_LABELS } from "@/lib/chat-taxonomy";

interface PresetPickerProps {
  activePresetId: number | null;
  onSelect: (preset: Preset | null) => void;
}

const KEY_SEPARATOR = "::";

function modelKeyFor(model: string, task: string): string {
  return model + KEY_SEPARATOR + task;
}

function parseModelKey(key: string): [string, string] | null {
  const index = key.indexOf(KEY_SEPARATOR);
  if (index === -1) return null;
  return [key.slice(0, index), key.slice(index + KEY_SEPARATOR.length)];
}

const EMPTY_FORM = { name: "", modelKey: "", systemPrompt: "", temperature: "" };

// Тот же попап-паттерн, что у ModelPicker/AccountMenu (кнопка-триггер,
// outside-click + Escape, общие CSS-классы model-picker-*) — новый
// модальный примитив тут не нужен.
export function PresetPicker({ activePresetId, onSelect }: PresetPickerProps) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [models, setModels] = useState<ModelProgress[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open || presets !== null) return;
    api
      .presets()
      .then(setPresets, (err) => setError(apiErrorMessage(err, "Не удалось загрузить пресеты.")));
  }, [open, presets]);

  useEffect(() => {
    if (!creating || models.length > 0) return;
    api.modelsCatalog().then(setModels, () => undefined);
  }, [creating, models.length]);

  const activePreset = presets?.find((preset) => preset.id === activePresetId) ?? null;
  const unlockedModels = models.filter((entry) => entry.unlocked);

  function select(preset: Preset | null) {
    onSelect(preset);
    setOpen(false);
  }

  async function handleDelete(id: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await api.deletePreset(id);
      setPresets((prev) => prev?.filter((preset) => preset.id !== id) ?? prev);
      if (activePresetId === id) onSelect(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось удалить пресет."));
    }
  }

  async function submitCreate() {
    const parsed = parseModelKey(form.modelKey);
    if (!form.name.trim() || !parsed) return;
    const [model, task] = parsed;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await api.createPreset({
        name: form.name.trim(),
        model,
        task: task as Task,
        system_prompt: form.systemPrompt,
        temperature: form.temperature ? Number(form.temperature) : null,
      });
      setPresets((prev) => [created, ...(prev ?? [])]);
      setForm(EMPTY_FORM);
      setCreating(false);
    } catch (err) {
      setSaveError(apiErrorMessage(err, "Не удалось сохранить пресет."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Пресет: ${activePreset ? activePreset.name : "нет"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="model-picker-trigger"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6h12M4 10h8M4 14h5" strokeLinecap="round" />
        </svg>
        <span className="max-w-32 truncate">{activePreset ? activePreset.name : "Пресеты"}</span>
      </button>

      {open && (
        <div className="model-picker-popover">
          <div role="dialog" aria-label="Пресеты" className="max-h-[26rem] overflow-y-auto p-2">
            {error && (
              <p role="alert" className="px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            {presets === null && !error && (
              <p className="px-3 py-6 text-center text-sm text-muted">Загрузка…</p>
            )}

            {presets && presets.length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-muted">Пока нет сохранённых пресетов.</p>
            )}

            {presets?.map((preset) => (
              <div key={preset.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  aria-pressed={preset.id === activePresetId}
                  onClick={() => select(preset)}
                  className="model-picker-option flex-1"
                >
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-medium text-ink">{preset.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {preset.model} · {TASK_LABELS[preset.task] ?? preset.task}
                    </span>
                  </span>
                  {preset.id === activePresetId && (
                    <span className="text-primary" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Удалить пресет «${preset.name}»`}
                  onClick={(event) => void handleDelete(preset.id, event)}
                  className="shrink-0 rounded-md p-1 text-muted opacity-50 transition hover:bg-bg/50 hover:text-danger focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M4 4l8 8m0-8-8 8" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}

            {activePreset && (
              <button type="button" onClick={() => select(null)} className="model-picker-option mt-1">
                <span className="min-w-0 flex-1 text-left text-sm text-muted">Сбросить пресет</span>
              </button>
            )}

            {!creating ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-raised hover:text-ink"
              >
                <span aria-hidden="true">+</span> Создать пресет
              </button>
            ) : (
              <div className="mt-2 flex flex-col gap-2 border-t border-border/70 pt-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Название</span>
                  <input
                    value={form.name}
                    onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                    maxLength={80}
                    className="input"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Модель</span>
                  <select
                    value={form.modelKey}
                    onChange={(event) => setForm((prev) => ({ ...prev, modelKey: event.target.value }))}
                    className="input"
                  >
                    <option value="">Выберите модель</option>
                    {unlockedModels.map((entry) => (
                      <option key={modelKeyFor(entry.model, entry.task)} value={modelKeyFor(entry.model, entry.task)}>
                        {entry.model} · {TASK_LABELS[entry.task] ?? entry.task}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Системный промпт</span>
                  <textarea
                    value={form.systemPrompt}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, systemPrompt: event.target.value }))
                    }
                    rows={3}
                    maxLength={4000}
                    className="input"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted">Температура (необязательно, 0–2)</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={form.temperature}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, temperature: event.target.value }))
                    }
                    className="input"
                  />
                </label>

                {saveError && (
                  <p role="alert" className="text-xs text-danger">
                    {saveError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void submitCreate()}
                    disabled={saving || !form.name.trim() || !form.modelKey}
                    className="btn-primary flex-1"
                  >
                    {saving ? "Сохраняем…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setForm(EMPTY_FORM);
                      setSaveError(null);
                    }}
                    className="btn-secondary"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
