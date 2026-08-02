"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { StudioMark } from "@/components/studio-mark";
import { springs } from "@/lib/motion";

export type StudioControlMode = "image" | "video" | "audio" | "edit" | "upscale";
type OpenPanel = "tools" | "models" | "settings" | null;

const LABELS: Record<StudioControlMode, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  edit: "Edit",
  upscale: "Upscale",
};

const TOOL_OPTIONS: Record<StudioControlMode, string[]> = {
  image: ["Create image", "Style reference", "References", "Inpaint", "Background changer", "Face swap"],
  video: ["Text to video", "Animate image", "Lipsync", "Video extend", "Motion control", "Video reframe"],
  audio: ["Text to speech", "Transcription", "Narration", "Voice cloning", "Music"],
  edit: ["Edit image", "Inpaint", "Outpaint", "Relight", "Camera angles", "Edit video"],
  upscale: ["Image upscale", "Face recovery", "Texture preserve", "2× clarity", "4× detail"],
};

const MODEL_OPTIONS: Record<StudioControlMode, string[]> = {
  image: ["FLUX Schnell", "DALL·E 3", "FLUX.1 Dev"],
  // Раньше здесь были вымышленные бренды (Veo/Kling/Sora), к которым не
  // подключён ни один адаптер — теперь Text to video реально маршрутизирует
  // на Wan 2.5, называть панель иначе было бы вводящим в заблуждение.
  video: ["Wan 2.5 Fast"],
  audio: ["Whisper", "Eleven Multilingual", "Lumen Voice"],
  edit: ["FLUX.1 Kontext", "GPT Image Edit", "Recraft Edit"],
  // Те же 4 строки, что и UPSCALE_LABELS в images/page.tsx — здесь это не
  // просто декоративный список названий брендов (как было раньше с Topaz/
  // Magnific), а реально работающий пикер: onModelChange у Images для
  // initialMode="upscale" маршрутизирует именно по этим подписям.
  upscale: ["2× clarity", "4× detail", "Face recovery", "Texture preserve"],
};

const DEFAULT_SETTINGS = {
  aspect: "1:1",
  resolution: "1K",
  quality: "Low",
  visibility: "Private",
  variations: "1",
  promptEnhancer: false,
  duration: "5",
  scale: "2×",
  faceStrength: "80",
  texturePreservation: "65",
};

export interface StudioWorkspaceControlsProps {
  mode: StudioControlMode;
  compact?: boolean;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
}

export function StudioWorkspaceControls({
  mode,
  compact = false,
  selectedModel,
  onModelChange,
}: StudioWorkspaceControlsProps) {
  const label = LABELS[mode];
  const shouldReduceMotion = useReducedMotion();
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [tool, setTool] = useState(TOOL_OPTIONS[mode][0]);
  const [localModel, setLocalModel] = useState("Автовыбор");
  const model = selectedModel ?? localModel;
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [modelQuery, setModelQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLButtonElement>(null);
  const modelsRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!openPanel) return;
    function closeOnOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpenPanel(null);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const trigger = openPanel === "tools" ? toolsRef.current : openPanel === "models" ? modelsRef.current : settingsRef.current;
      setOpenPanel(null);
      requestAnimationFrame(() => trigger?.focus());
    }
    document.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [openPanel]);

  function toggle(panel: Exclude<OpenPanel, null>) {
    setOpenPanel((current) => current === panel ? null : panel);
  }

  function chooseModel(option: string) {
    if (onModelChange) onModelChange(option);
    else setLocalModel(option);
  }

  return (
    <div ref={rootRef} className={`studio-workspace-controls ${compact ? "is-compact" : ""}`}>
      <div className="studio-control-bar" aria-label={`${label} controls`}>
        <button
          ref={toolsRef}
          type="button"
          aria-label={`Инструменты ${label}`}
          aria-haspopup="dialog"
          aria-expanded={openPanel === "tools"}
          onClick={() => toggle("tools")}
        >
          <StudioMark active className="size-4" />
          <span>{compact ? tool : `Tool · ${tool}`}</span>
        </button>
        <button
          ref={modelsRef}
          type="button"
          aria-label={`Модель ${label}: ${model}`}
          aria-haspopup="dialog"
          aria-expanded={openPanel === "models"}
          onClick={() => toggle("models")}
        >
          <span aria-hidden="true">◈</span>
          <span>{model}</span>
        </button>
        <button
          ref={settingsRef}
          type="button"
          aria-label={`Настройки ${label}`}
          aria-haspopup="dialog"
          aria-expanded={openPanel === "settings"}
          onClick={() => toggle("settings")}
        >
          <span aria-hidden="true">⌁</span>
          <span>Settings</span>
        </button>
      </div>

      <AnimatePresence>
        {openPanel === "tools" && (
          <ControlPanel label={`${label}: инструменты`} reduced={Boolean(shouldReduceMotion)} onClose={() => setOpenPanel(null)}>
            <PanelHeading title={`${label} tools`} detail="Выберите рабочий сценарий" />
            <div className="studio-control-list">
              {TOOL_OPTIONS[mode].map((option) => {
                const preview = isPreviewTool(mode, option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={tool === option}
                    onClick={() => setTool(option)}
                    className="studio-control-option"
                  >
                    <span className="studio-control-glyph" aria-hidden="true">◇</span>
                    <span><strong>{option}</strong><small>{preview ? "Preview · provider required" : "Ready in Lumenza"}</small></span>
                    {preview ? <em>Soon</em> : tool === option ? <em>Active</em> : null}
                  </button>
                );
              })}
            </div>
          </ControlPanel>
        )}

        {(openPanel === "models" || openPanel === "settings") && (
          <ControlPanel
            label={openPanel === "models" ? `${label}: выбор модели` : `${label}: настройки`}
            reduced={Boolean(shouldReduceMotion)}
            wide
            dataLayout="model-settings"
            onClose={() => setOpenPanel(null)}
          >
            <div className="grid min-h-0 gap-5 md:grid-cols-[minmax(15rem,0.82fr)_minmax(22rem,1.4fr)]">
              <section aria-label={`${label}: модели`} className="min-w-0 border-b border-border/50 pb-5 md:border-b-0 md:border-r md:pb-0 md:pr-5">
                <PanelHeading title="Select model" detail="Модель применяется там, где это поддерживает API" />
                <label className="studio-model-search">
                  <span className="sr-only">{`Поиск моделей ${label}`}</span>
                  <input
                    type="search"
                    aria-label={`Поиск моделей ${label}`}
                    value={modelQuery}
                    onChange={(event) => setModelQuery(event.target.value)}
                    placeholder="Search models"
                  />
                </label>
                <div className="studio-model-list">
                  {["Автовыбор", ...MODEL_OPTIONS[mode]]
                    .filter((option) => option.toLocaleLowerCase().includes(modelQuery.trim().toLocaleLowerCase()))
                    .map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={model === option}
                      onClick={() => chooseModel(option)}
                      className="studio-control-option"
                    >
                      <span className="studio-control-glyph" aria-hidden="true">{option === "Автовыбор" ? "A" : option.slice(0, 1)}</span>
                      <span><strong>{option}</strong><small>{modelDetail(mode, option)}</small></span>
                      {model === option && <em>✓</em>}
                    </button>
                  ))}
                </div>
              </section>

              <section aria-label={`${label}: параметры`} className="min-w-0">
                <div className="studio-settings-heading">
                  <PanelHeading title={`${label} settings`} detail="Параметры проекта сохраняются в текущей сессии" />
                  <button type="button" onClick={() => setSettings(DEFAULT_SETTINGS)}>Reset</button>
                </div>
                <div className="studio-settings-grid">
                  <SettingsGroup
                    label="Aspect ratio"
                    name={`${mode}-aspect`}
                    value={settings.aspect}
                    options={["9:16", "3:4", "1:1", "4:3", "16:9", "21:9"]}
                    onChange={(aspect) => setSettings((current) => ({ ...current, aspect }))}
                  />
                  <SettingsGroup
                    label="Resolution"
                    name={`${mode}-resolution`}
                    value={settings.resolution}
                    options={["1K", "2K", "4K"]}
                    onChange={(resolution) => setSettings((current) => ({ ...current, resolution }))}
                  />
                  <SettingsGroup
                    label="Quality"
                    name={`${mode}-quality`}
                    value={settings.quality}
                    options={["Low", "Medium", "High"]}
                    onChange={(quality) => setSettings((current) => ({ ...current, quality }))}
                  />
                  <SettingsGroup
                    label="Visibility"
                    name={`${mode}-visibility`}
                    value={settings.visibility}
                    options={["Private", "Public"]}
                    onChange={(visibility) => setSettings((current) => ({ ...current, visibility }))}
                  />
                  <SettingsGroup
                    label="Variations"
                    name={`${mode}-variations`}
                    value={settings.variations}
                    options={["1", "2", "3", "4"]}
                    optionLabel={(option) => `${option} ${option === "1" ? "variation" : "variations"}`}
                    onChange={(variations) => setSettings((current) => ({ ...current, variations }))}
                  />
                  {mode === "video" && (
                    <SettingsGroup
                      label="Duration"
                      name={`${mode}-duration`}
                      value={settings.duration}
                      options={["5", "10", "15"]}
                      optionLabel={(option) => `${option} seconds`}
                      onChange={(duration) => setSettings((current) => ({ ...current, duration }))}
                    />
                  )}
                  {mode === "upscale" && (
                    <>
                      <SettingsGroup
                        label="Scale"
                        name={`${mode}-scale`}
                        value={settings.scale}
                        options={["2×", "4×"]}
                        onChange={(scale) => setSettings((current) => ({ ...current, scale }))}
                      />
                      <RangeSetting
                        label="Face enhancement strength"
                        value={settings.faceStrength}
                        onChange={(faceStrength) => setSettings((current) => ({ ...current, faceStrength }))}
                      />
                      <RangeSetting
                        label="Texture preservation"
                        value={settings.texturePreservation}
                        onChange={(texturePreservation) => setSettings((current) => ({ ...current, texturePreservation }))}
                      />
                    </>
                  )}
                  <label className="studio-settings-toggle">
                    <span><strong>Prompt enhancer</strong><small>Расширить короткий промпт перед генерацией</small></span>
                    <input
                      aria-label="Prompt enhancer"
                      type="checkbox"
                      checked={settings.promptEnhancer}
                      onChange={(event) => setSettings((current) => ({ ...current, promptEnhancer: event.target.checked }))}
                    />
                  </label>
                </div>
                <p className="studio-settings-note" role="note">
                  Недоступные серверу параметры сохраняются как настройки проекта и не отправляются в generation API.
                </p>
              </section>
            </div>
          </ControlPanel>
        )}
      </AnimatePresence>
    </div>
  );
}

function ControlPanel({ label, reduced, wide = false, dataLayout, onClose, children }: { label: string; reduced: boolean; wide?: boolean; dataLayout?: string; onClose: () => void; children: ReactNode }) {
  return (
    <motion.div
      role="dialog"
      aria-label={label}
      data-layout={dataLayout}
      initial={reduced ? false : { opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
      transition={reduced ? { duration: 0 } : springs.snappy}
      className={`studio-control-panel ${wide ? "is-wide" : ""}`}
    >
      <button type="button" aria-label="Закрыть панель" className="studio-control-close" onClick={onClose}>×</button>
      {children}
    </motion.div>
  );
}

function PanelHeading({ title, detail }: { title: string; detail: string }) {
  return <div className="studio-control-heading"><h2>{title}</h2><p>{detail}</p></div>;
}

function SettingsGroup({ label, name, value, options, optionLabel, onChange }: { label: string; name: string; value: string; options: string[]; optionLabel?: (option: string) => string; onChange: (value: string) => void }) {
  return (
    <fieldset className="studio-settings-group">
      <legend>{label}</legend>
      <div>
        {options.map((option) => (
          <label key={option}>
            <input type="radio" name={name} value={option} checked={value === option} onChange={() => onChange(option)} />
            <span>{optionLabel?.(option) ?? option}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RangeSetting({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="studio-range-setting">
      <span><strong>{label}</strong><em>{value}%</em></span>
      <input
        type="range"
        aria-label={label}
        min="0"
        max="100"
        step="5"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function modelDetail(mode: StudioControlMode, option: string): string {
  if (option === "Автовыбор") return "Recommended routing";
  if (mode === "image" && option === "FLUX Schnell") return "Replicate · fastest illustration route";
  if (mode === "image" && option === "DALL·E 3") return "OpenAI · photorealistic route";
  if (mode === "image" && option === "FLUX.1 Dev") return "NVIDIA · premium route";
  if (mode === "edit" && option === "FLUX.1 Kontext") return "NVIDIA · connected image edit route";
  if (mode === "video" && option === "Wan 2.5 Fast") return "Replicate · connected text/image-to-video route";
  if (mode === "upscale") return "Replicate · Real-ESRGAN route";
  return "Workspace preference · provider required";
}

function isPreviewTool(mode: StudioControlMode, tool: string): boolean {
  if (mode === "video") return !["Text to video", "Animate image"].includes(tool);
  if (mode === "upscale") return false;
  if (mode === "audio") return tool === "Voice cloning" || tool === "Music";
  if (mode === "edit") return !["Edit image"].includes(tool);
  return !["Create image", "Inpaint"].includes(tool);
}
