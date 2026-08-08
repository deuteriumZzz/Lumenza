import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  presets: vi.fn(),
  createPreset: vi.fn(),
  deletePreset: vi.fn(),
  modelsCatalog: vi.fn(),
  onSelect: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      presets: mocks.presets,
      createPreset: mocks.createPreset,
      deletePreset: mocks.deletePreset,
      modelsCatalog: mocks.modelsCatalog,
    },
  };
});

import { PresetPicker } from "@/components/preset-picker";

const PRESET = {
  id: 1,
  name: "Дерзкий копирайтер",
  model: "gpt-4o-mini",
  task: "hook" as const,
  system_prompt: "Отвечай дерзко и коротко.",
  temperature: 0.9,
  created_at: "",
  updated_at: "",
};

describe("PresetPicker", () => {
  afterEach(() => {
    cleanup();
    mocks.presets.mockReset();
    mocks.createPreset.mockReset();
    mocks.deletePreset.mockReset();
    mocks.modelsCatalog.mockReset();
    mocks.onSelect.mockReset();
  });

  it("lists saved presets and selects one", async () => {
    mocks.presets.mockResolvedValue([PRESET]);
    render(<PresetPicker activePresetId={null} onSelect={mocks.onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Пресет: нет" }));
    fireEvent.click(await screen.findByRole("button", { name: /^Дерзкий копирайтер/ }));

    expect(mocks.onSelect).toHaveBeenCalledWith(PRESET);
  });

  it("shows an empty state when there are no presets yet", async () => {
    mocks.presets.mockResolvedValue([]);
    render(<PresetPicker activePresetId={null} onSelect={mocks.onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Пресет: нет" }));

    expect(
      await screen.findByText("Пока нет сохранённых пресетов."),
    ).toBeDefined();
  });

  it("creates a new preset from the inline form", async () => {
    mocks.presets.mockResolvedValue([]);
    mocks.modelsCatalog.mockResolvedValue([
      {
        task: "hook",
        provider: "openai",
        model: "gpt-4o-mini",
        unlocked: true,
        access_class: "standard",
        current_requests: 0,
        target_requests: 0,
        current_days: 0,
        target_days: 0,
      },
    ]);
    mocks.createPreset.mockResolvedValue(PRESET);
    render(<PresetPicker activePresetId={null} onSelect={mocks.onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Пресет: нет" }));
    fireEvent.click(await screen.findByRole("button", { name: /Создать пресет/ }));

    fireEvent.change(await screen.findByLabelText("Название"), {
      target: { value: "Дерзкий копирайтер" },
    });
    // Ждём, пока каталог моделей подгрузится и опция реально появится в
    // select — иначе fireEvent.change на несуществующее значение опции
    // молча не срабатывает.
    await screen.findByRole("option", { name: /gpt-4o-mini/ });
    fireEvent.change(screen.getByLabelText("Модель"), {
      target: { value: "gpt-4o-mini::hook" },
    });
    fireEvent.change(screen.getByLabelText("Системный промпт"), {
      target: { value: "Отвечай дерзко и коротко." },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    });

    expect(mocks.createPreset).toHaveBeenCalledWith({
      name: "Дерзкий копирайтер",
      model: "gpt-4o-mini",
      task: "hook",
      system_prompt: "Отвечай дерзко и коротко.",
      temperature: null,
    });
    expect(await screen.findByRole("button", { name: /^Дерзкий копирайтер/ })).toBeDefined();
  });

  it("deletes a preset and clears the active selection", async () => {
    mocks.presets.mockResolvedValue([PRESET]);
    mocks.deletePreset.mockResolvedValue(undefined);
    render(<PresetPicker activePresetId={1} onSelect={mocks.onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "Пресет: нет" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Удалить пресет «Дерзкий копирайтер»" }),
    );

    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Удалить" }));

    await waitFor(() => expect(mocks.deletePreset).toHaveBeenCalledWith(1));
    expect(mocks.onSelect).toHaveBeenCalledWith(null);
  });
});
