"use client";

import { useRef, useState } from "react";
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
  const localReferenceInputRef = useRef<HTMLInputElement>(null);
  const [localReference, setLocalReference] = useState<File | null>(null);
  const supportsLocalReference = !onAddReference && (mode === "image" || mode === "edit");
  const effectiveReferenceLabel = referenceLabel ?? localReference?.name;
  const unsupportedReferenceAttached = supportsLocalReference && Boolean(localReference);
  const canSubmit = !disabled && !submitDisabled && !busy && !unsupportedReferenceAttached && prompt.trim().length > 0;

  function clearLocalReference() {
    setLocalReference(null);
    if (localReferenceInputRef.current) localReferenceInputRef.current.value = "";
  }

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
      {supportsLocalReference && (
        <input
          ref={localReferenceInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label={`Локальный референс ${label}`}
          className="sr-only"
          onChange={(event) => setLocalReference(event.target.files?.[0] ?? null)}
        />
      )}
      <div className="studio-prompt-editor">
        <button
          type="button"
          className="studio-prompt-add"
          aria-label="Добавить референс"
          disabled={disabled || (!onAddReference && !supportsLocalReference)}
          onClick={onAddReference ?? (() => localReferenceInputRef.current?.click())}
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

      {effectiveReferenceLabel && (
        <div className="studio-reference-chip">
          <span aria-hidden="true">◇</span>
          <span>{effectiveReferenceLabel}</span>
          {localReference && (
            <button type="button" aria-label="Удалить локальный референс" onClick={clearLocalReference}>
              ×
            </button>
          )}
        </div>
      )}

      {localReference && (
        <p className="studio-settings-note" role="note">
          Референс прикреплён локально к черновику. Текущий image API пока не передаёт референс в генерацию, поэтому создание временно недоступно.
        </p>
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
