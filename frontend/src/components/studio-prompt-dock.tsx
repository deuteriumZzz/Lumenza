"use client";

import { motion, useReducedMotion } from "motion/react";
import {
  StudioWorkspaceControls,
  type StudioControlMode,
} from "@/components/studio-workspace-controls";
import { springs } from "@/lib/motion";

interface StudioPromptDockProps {
  mode: StudioControlMode;
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  onAddReference?: () => void;
  disabled?: boolean;
  submitDisabled?: boolean;
  busy?: boolean;
  status?: string;
  placeholder?: string;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  referenceLabel?: string;
  ariaLabel?: string;
  promptLabel?: string;
}

const MODE_LABELS: Record<StudioControlMode, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  edit: "Edit",
  upscale: "Upscale",
};

const PLACEHOLDERS: Record<StudioControlMode, string> = {
  image: "Опишите изображение, которое хотите создать…",
  video: "Опишите сцену, движение камеры и настроение…",
  audio: "Опишите голос, музыку или звуковую сцену…",
  edit: "Опишите, что нужно изменить в изображении…",
  upscale: "Что важнее сохранить: лицо, текстуру или мелкие детали?",
};

export function StudioPromptDock({
  mode,
  prompt,
  onPromptChange,
  onSubmit,
  onAddReference,
  disabled = false,
  submitDisabled = false,
  busy = false,
  status,
  placeholder,
  selectedModel,
  onModelChange,
  referenceLabel,
  ariaLabel,
  promptLabel,
}: StudioPromptDockProps) {
  const reduceMotion = useReducedMotion();
  const label = MODE_LABELS[mode];
  const canSubmit = !disabled && !submitDisabled && !busy && prompt.trim().length > 0;

  return (
    <motion.form
      aria-label={ariaLabel ?? `${label} prompt composer`}
      data-placement="bottom"
      className="studio-prompt-dock"
      initial={reduceMotion ? false : { opacity: 0, y: 20, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : springs.gentle}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) onSubmit();
      }}
    >
      <div className="studio-prompt-editor">
        <button
          type="button"
          className="studio-prompt-add"
          aria-label="Добавить референс"
          disabled={disabled || !onAddReference}
          onClick={onAddReference}
        >
          <span aria-hidden="true">＋</span>
        </button>
        <textarea
          aria-label={promptLabel ?? `Промпт ${label}`}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder={placeholder ?? PLACEHOLDERS[mode]}
          maxLength={4000}
          rows={2}
          disabled={disabled}
        />
      </div>

      {referenceLabel && (
        <div className="studio-reference-chip">
          <span aria-hidden="true">◇</span>
          <span>{referenceLabel}</span>
        </div>
      )}

      <div className="studio-prompt-footer">
        <StudioWorkspaceControls
          mode={mode}
          compact
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
        <button type="submit" className="studio-create-button" disabled={!canSubmit}>
          <span>{busy ? "Создаём…" : "Создать"}</span>
          <span aria-hidden="true">↗</span>
        </button>
      </div>

      {status && <p className="studio-prompt-status" role="status">{status}</p>}
    </motion.form>
  );
}
