"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { Images } from "@/app/images/page";
import { Voice } from "@/app/voice/page";
import { Documents } from "@/app/documents/page";
import { Analyze } from "@/app/analyze/page";
import { Code } from "@/app/code/page";
import { StudioMark } from "@/components/studio-mark";
import { AllToolsCatalog } from "@/components/all-tools-catalog";
import { StudioPromptDock } from "@/components/studio-prompt-dock";
import { StudioWorkspaceControls, type StudioControlMode } from "@/components/studio-workspace-controls";
import { useSetStudioMode } from "@/components/zone";
import { motionTokens, springs } from "@/lib/motion";

type StudioMode = "image" | "video" | "audio" | "edit" | "upscale";
type LegacyStudioMode = "documents" | "analyze" | "code";
type StudioWorkspaceMode = StudioMode | LegacyStudioMode;
type StudioView = "workspace" | "tools" | "apps" | "community";

const MODES: { key: StudioMode; label: string; eyebrow: string }[] = [
  { key: "image", label: "Image", eyebrow: "Generate" },
  { key: "video", label: "Video", eyebrow: "Motion" },
  { key: "audio", label: "Audio", eyebrow: "Voice" },
  { key: "edit", label: "Edit", eyebrow: "Transform" },
  { key: "upscale", label: "Upscale", eyebrow: "Enhance" },
];

const APPS = [
  { name: "Campaign canvas", description: "Соберите визуальную серию из одной идеи.", tone: "warm", category: "Design", route: "/studio?mode=image" },
  { name: "Product stories", description: "Карточки товара, ракурсы и тексты в одном потоке.", tone: "cool", category: "Design", route: "/studio?mode=image" },
  { name: "Portrait lab", description: "Стиль, свет и точная ретушь портретов.", tone: "portrait", category: "Image editing", route: "/studio?mode=edit" },
  { name: "Social cut", description: "Подготовьте набор форматов для публикации.", tone: "signal", category: "Social", route: "/agents?category=content" },
  { name: "Brand backdrop", description: "Единый фон для каталога и рекламных кампаний.", tone: "cool", category: "Image editing", route: "/studio?mode=edit" },
  { name: "Motion storyboard", description: "Ключевые кадры, движение камеры и видео-концепт.", tone: "signal", category: "Video", route: "/studio?mode=video" },
  { name: "Podcast identity", description: "Голос, обложка и аудио-стиль нового шоу.", tone: "portrait", category: "Audio", route: "/studio?mode=audio" },
  { name: "Lookbook maker", description: "Соберите модную серию с устойчивым визуальным кодом.", tone: "warm", category: "Design", route: "/studio?mode=image" },
  { name: "Detail recovery", description: "Увеличьте исходник и сохраните лица, текст и фактуру.", tone: "cool", category: "Image editing", route: "/studio?mode=upscale" },
  { name: "Launch kit", description: "Полный комплект визуалов и текстов для запуска.", tone: "signal", category: "Social", route: "/agents?category=content" },
  { name: "Reference remix", description: "Новая композиция на основе нескольких референсов.", tone: "portrait", category: "Design", route: "/studio?mode=image" },
  { name: "Short-form lab", description: "Вертикальные ролики из одного сценария и набора кадров.", tone: "warm", category: "Video", route: "/studio?mode=video" },
];

const INSPIRATION_CATEGORIES = ["Featured", "Photography", "Design", "Illustration", "Portraits"] as const;

const INSPIRATIONS = [
  { title: "Violet editorial", category: "Photography", tile: "tile-1" },
  { title: "Liquid typography", category: "Design", tile: "tile-2" },
  { title: "Quiet architecture", category: "Photography", tile: "tile-3" },
  { title: "Paper creatures", category: "Illustration", tile: "tile-4" },
  { title: "Soft flash portrait", category: "Portraits", tile: "tile-5" },
  { title: "Chrome still life", category: "Design", tile: "tile-6" },
] as const;

export default function StudioPage() {
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const queryKey = searchParams.toString();
  const requestedMode = parseMode(searchParams.get("mode"));
  const requestedView = parseView(searchParams.get("view"));
  const autoStart = searchParams.get("autostart") === "1";
  const initialDraft = searchParams.get("draft") ?? "";
  const [selection, setSelection] = useState(() => ({
    queryKey,
    mode: requestedMode ?? "image" as StudioWorkspaceMode,
    view: requestedView ?? "workspace" as StudioView,
  }));

  if (selection.queryKey !== queryKey) {
    setSelection({
      queryKey,
      mode: requestedMode ?? selection.mode,
      view: requestedView ?? "workspace",
    });
  }

  const setZoneMode = useSetStudioMode();
  useEffect(() => {
    const zoneMode = selection.mode === "audio"
      ? "voice"
      : selection.mode === "documents" || selection.mode === "analyze" || selection.mode === "code"
        ? selection.mode
        : "images";
    setZoneMode(zoneMode);
  }, [selection.mode, setZoneMode]);

  function selectMode(mode: StudioMode) {
    if (selection.mode === mode && selection.view === "workspace") return;
    setSelection({ queryKey, mode, view: "workspace" });
    if (queryKey) router.replace("/studio", { scroll: false });
  }

  return (
    <div className="studio-shell min-h-0 flex-1">
      <header className="studio-header">
        <div>
          <p className="studio-kicker">Lumenza creative suite</p>
          <h1 className="studio-title">Welcome to Lumenza Studio</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="studio-header-status" aria-label="Статус студии">
            <span className="studio-live-dot" aria-hidden="true" />
            Project synced
          </div>
          <Link href="/pricing" className="workspace-outline-button">Тариф</Link>
        </div>
      </header>

      {selection.view === "workspace" && (
        <motion.aside
          aria-label="Навигация Studio"
          initial={shouldReduceMotion ? false : { opacity: 0, y: -motionTokens.distance.sm }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: shouldReduceMotion ? 0 : motionTokens.duration.normal,
            ease: motionTokens.easing.smooth,
          }}
          className="studio-subrail"
        >
          <div className="studio-subrail-view-switch">
            <Link href="/studio" aria-current="page">Default</Link>
            <Link href="/studio?view=apps">Apps</Link>
          </div>
          <div className="studio-subrail-section-tabs">
            <Link href="/studio" data-active="">Inspirations</Link>
            <Link href="/studio?view=community">Community</Link>
          </div>
          <p>Choose a mode</p>
          <nav data-testid="studio-mode-navigation" role="tablist" aria-label="Режим студии" className="studio-mode-navigation">
            <span data-testid="studio-navigation-mark" className="studio-navigation-mark" title="Lumenza Studio">
              <StudioMark active className="size-5" />
            </span>
            {MODES.map((option) => (
              <motion.button
                key={option.key}
                type="button"
                id={`studio-tab-${option.key}`}
                role="tab"
                aria-label={option.label}
                aria-selected={selection.mode === option.key}
                aria-controls={`studio-panel-${option.key}`}
                onClick={() => selectMode(option.key)}
                whileHover={shouldReduceMotion ? undefined : { x: 3 }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
                className="studio-mode-button"
              >
                {selection.mode === option.key && (
                  <motion.span
                    layoutId="studio-active-mode"
                    data-testid="studio-active-indicator"
                    aria-hidden="true"
                    className="studio-mode-active"
                    transition={shouldReduceMotion ? { duration: 0 } : springs.snappy}
                  />
                )}
                <span className="studio-mode-eyebrow">{option.eyebrow}</span>
                <span className="studio-mode-label">{option.label}</span>
              </motion.button>
            ))}
          </nav>
        </motion.aside>
      )}

      <div className="studio-mode-stage">
        <AnimatePresence mode="sync" initial={false}>
          {selection.view === "workspace" ? (
            <StudioModePanel
              key={`${selection.mode}:${autoStart ? "autostart" : "manual"}`}
              mode={selection.mode}
              autoStart={autoStart}
              initialDraft={initialDraft}
            />
          ) : (
            <StudioCatalog key={selection.view} view={selection.view} initialTool={searchParams.get("tool")} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function StudioModePanel({ mode, autoStart, initialDraft }: { mode: StudioWorkspaceMode; autoStart: boolean; initialDraft: string }) {
  const shouldReduceMotion = useReducedMotion();
  const isPresent = useIsPresent();

  return (
    <motion.section
      id={`studio-panel-${mode}`}
      role="tabpanel"
      aria-labelledby={MODES.some((option) => option.key === mode) ? `studio-tab-${mode}` : undefined}
      data-testid="studio-mode-panel"
      data-mode={mode}
      aria-hidden={!isPresent}
      inert={!isPresent ? true : undefined}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 26, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.99 }}
      transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
      className="studio-panel"
    >
      {mode === "image" && (
        <WorkspaceSurface mode="image">
          <StudioInspirationFeed />
          <Images key={initialDraft || "empty-draft"} initialPrompt={initialDraft} />
        </WorkspaceSurface>
      )}
      {mode === "audio" && <WorkspaceSurface mode="audio"><AudioWorkspace autoStart={autoStart} /></WorkspaceSurface>}
      {mode === "edit" && <WorkspaceSurface mode="edit"><EditWorkspace /></WorkspaceSurface>}
      {(mode === "video" || mode === "upscale") && <WorkspaceSurface mode={mode}><CapabilityWorkspace mode={mode} /></WorkspaceSurface>}
      {mode === "documents" && <Documents />}
      {mode === "analyze" && <Analyze />}
      {mode === "code" && <Code />}
    </motion.section>
  );
}

function StudioInspirationFeed() {
  const [category, setCategory] = useState<(typeof INSPIRATION_CATEGORIES)[number]>("Featured");
  const visibleItems = category === "Featured"
    ? INSPIRATIONS
    : INSPIRATIONS.filter((item) => item.category === category);

  return (
    <section
      data-testid="studio-inspiration-feed"
      aria-labelledby="studio-inspiration-title"
      className="mx-auto w-full max-w-[92rem] px-3 pt-3 min-[380px]:px-4 sm:px-8 lg:px-10"
    >
      <div className="studio-gallery-heading">
        <div>
          <p className="studio-kicker">Discover</p>
          <h2 id="studio-inspiration-title">Inspiration</h2>
          <p>Выберите направление, затем создайте собственную серию в нижней панели.</p>
        </div>
      </div>
      <div className="studio-community-filters" aria-label="Категории вдохновения">
        {INSPIRATION_CATEGORIES.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="studio-community-grid" aria-live="polite">
        {visibleItems.map((item) => (
          <Link
            key={item.title}
            href={`/studio?mode=image&draft=${encodeURIComponent(item.title)}`}
            aria-label={`Использовать идею ${item.title}`}
            className={`community-tile ${item.tile}`}
          >
            <span>{item.title}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function WorkspaceSurface({ mode, children }: { mode: StudioControlMode; children: ReactNode }) {
  const label = MODES.find((option) => option.key === mode)?.label ?? mode;
  return (
    <section role="region" aria-label={`${label} workspace`} className="studio-workspace-surface">
      {children}
    </section>
  );
}

function AudioWorkspace({ autoStart }: { autoStart: boolean }) {
  const cards = ["Text to speech", "Music", "Voice cloning"];
  const [selectedCard, setSelectedCard] = useState(cards[0]);

  return (
    <div className="studio-capability-layout studio-audio-layout">
      <ModeLibrary title="Audio workspace" cards={cards} selectedCard={selectedCard} onSelect={setSelectedCard} />
      <div className="studio-capability-canvas studio-embedded-workspace">
        <StudioWorkspaceControls mode="audio" compact />
        <Voice autoStart={autoStart} />
      </div>
    </div>
  );
}

function EditWorkspace() {
  const cards = ["Inpaint", "Outpaint", "Camera angles", "Relight", "Magic text"];
  const [selectedCard, setSelectedCard] = useState(cards[0]);

  return (
    <div className="studio-capability-layout">
      <ModeLibrary title="Edit workspace" cards={cards} selectedCard={selectedCard} onSelect={setSelectedCard} />
      <div className="studio-capability-canvas studio-embedded-workspace">
        <Images initialMode="edit" />
      </div>
    </div>
  );
}

function CapabilityWorkspace({ mode }: { mode: "video" | "upscale" }) {
  const isVideo = mode === "video";
  const title = isVideo ? "Video workspace" : "Upscale workspace";
  const cards = isVideo
    ? ["Text to video", "Starting frame", "Extend", "Reference video", "Edit video"]
    : ["2× clarity", "4× detail", "Face recovery", "Texture preserve"];

  const [selectedCard, setSelectedCard] = useState(cards[0]);
  const [prompt, setPrompt] = useState("");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function selectReference(file: File | null) {
    setReferenceFile(file);
    setPreviewUrl(file?.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  }

  return (
    <div className="studio-capability-layout">
      <ModeLibrary title={title} cards={cards} selectedCard={selectedCard} onSelect={setSelectedCard} />
      <div className="studio-capability-canvas">
        <input
          ref={referenceInputRef}
          className="sr-only"
          type="file"
          accept={isVideo ? "image/*,video/*" : "image/*"}
          aria-label={isVideo ? "Загрузить медиа для видео" : "Загрузить изображение для upscale"}
          onChange={(event) => selectReference(event.target.files?.[0] ?? null)}
        />
        {previewUrl ? (
          <button type="button" className="studio-upload-preview group" onClick={() => referenceInputRef.current?.click()}>
            {/* The object URL is local user input, never remote untrusted markup. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Загруженный референс" />
            <span>Заменить медиа</span>
          </button>
        ) : (
          <button type="button" className="studio-upload-card" onClick={() => referenceInputRef.current?.click()}>
            <span className="studio-empty-orbit" aria-hidden="true"><StudioMark active className="size-10" /></span>
            <strong>{isVideo ? "Добавьте стартовый кадр или видео" : "Загрузите изображение для улучшения"}</strong>
            <small>{isVideo ? "PNG, JPG, WEBP или MP4" : "PNG, JPG или WEBP · до 20 МБ"}</small>
          </button>
        )}
        <h2>{isVideo ? "Build motion from a clear idea" : "Recover detail without losing character"}</h2>
        <p>
          {isVideo
            ? "Video generation появится после подключения проверенного провайдера. Интерфейс и сценарии уже готовы."
            : "Upscale появится после подключения и тарификации модели улучшения. Сейчас можно подготовить проект и референсы."}
        </p>
        <StudioPromptDock
          mode={mode}
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={() => undefined}
          submitDisabled
          onAddReference={() => referenceInputRef.current?.click()}
          referenceLabel={referenceFile?.name}
          status="Провайдер пока не подключён · параметры можно подготовить заранее."
          placeholder={isVideo ? "Опишите сцену и движение" : "Добавьте изображение и задайте приоритет деталей"}
        />
      </div>
    </div>
  );
}

function ModeLibrary({
  title,
  cards,
  selectedCard,
  onSelect,
}: {
  title: string;
  cards: string[];
  selectedCard: string;
  onSelect: (card: string) => void;
}) {
  return (
    <aside className="studio-mode-library">
      <p className="studio-kicker">Choose a mode</p>
      <h2>{title}</h2>
      <div className="studio-mode-card-grid">
        {cards.map((card, index) => (
          <button
            key={card}
            type="button"
            aria-pressed={selectedCard === card}
            onClick={() => onSelect(card)}
            className={`studio-mode-card tone-${index % 4}`}
          >
            <span className="studio-mode-card-art" aria-hidden="true" />
            <span>{card}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function StudioCatalog({ view, initialTool }: { view: Exclude<StudioView, "workspace">; initialTool?: string | null }) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [appFilter, setAppFilter] = useState("Discover");
  const [appQuery, setAppQuery] = useState("");
  const [communityFilter, setCommunityFilter] = useState("Daily picks");
  const [communityPrompt, setCommunityPrompt] = useState("");
  const visibleApps = APPS.filter((app) =>
    (appFilter === "Discover" || app.category === appFilter) &&
    `${app.name} ${app.description}`.toLocaleLowerCase().includes(appQuery.trim().toLocaleLowerCase()),
  );
  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={shouldReduceMotion ? { duration: 0 } : springs.gentle}
      className={`studio-catalog ${view === "community" ? "has-prompt-dock" : ""}`}
    >
      {view === "tools" && (
        <>
          <CatalogHeading title="All tools" subtitle="Весь творческий стек Lumenza, сгруппированный по результату." />
          <AllToolsCatalog
            initialTool={initialTool}
            onSelectionChange={(toolId) => router.replace(`/studio?view=tools&tool=${toolId}`, { scroll: false })}
          />
        </>
      )}
      {view === "apps" && (
        <>
          <CatalogHeading title="Lumenza Apps" subtitle="Готовые многосоставные сценарии для повторяемой работы." />
          <div className="studio-app-toolbar">
            <div className="studio-filter-row" aria-label="Категории Apps">
              {['Discover', 'Design', 'Image editing', 'Video', 'Audio', 'Social'].map((item) => (
                <button type="button" key={item} aria-pressed={appFilter === item} onClick={() => setAppFilter(item)}>{item}</button>
              ))}
            </div>
            <label className="studio-app-search">
              <span className="sr-only">Поиск Apps</span>
              <input type="search" aria-label="Поиск Apps" value={appQuery} onChange={(event) => setAppQuery(event.target.value)} placeholder="Search apps" />
            </label>
          </div>
          <div className="studio-app-grid">
            {visibleApps.map((app) => (
              <article key={app.name} className={`studio-app-card tone-${app.tone}`}>
                <div className="studio-app-visual" aria-hidden="true" />
                <div><h2>{app.name}</h2><p>{app.description}</p></div>
                <Link href={app.route} aria-label={`Открыть ${app.name}`}>↗</Link>
              </article>
            ))}
          </div>
          {visibleApps.length === 0 && <p role="status" className="studio-catalog-empty">Ничего не найдено.</p>}
        </>
      )}
      {view === "community" && (
        <>
          <CatalogHeading title="Community" subtitle="Работы сообщества, которые можно разобрать, сохранить и превратить в свой проект." />
          <div className="studio-community-filters">
            {["Daily picks", "Popular", "Following"].map((filter) => (
              <button key={filter} type="button" aria-pressed={communityFilter === filter} onClick={() => setCommunityFilter(filter)}>{filter}</button>
            ))}
          </div>
          <div className="studio-community-grid" aria-label={`Галерея сообщества · ${communityFilter}`}>
            {Array.from({ length: 9 }, (_, index) => <article key={index} className={`community-tile tile-${index + 1}`}><span>Made with Lumenza</span></article>)}
          </div>
          <StudioPromptDock
            mode="image"
            ariaLabel="Community image composer"
            promptLabel="Промпт"
            prompt={communityPrompt}
            onPromptChange={setCommunityPrompt}
            onSubmit={() => router.push(`/studio?mode=image&draft=${encodeURIComponent(communityPrompt.trim())}`)}
            onAddReference={() => router.push("/studio?mode=image")}
            placeholder="Опишите изображение или идею из Community…"
          />
        </>
      )}
    </motion.section>
  );
}

function CatalogHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="studio-catalog-heading"><p className="studio-kicker">Explore</p><h1>{title}</h1><p>{subtitle}</p></div>;
}

function parseMode(value: string | null): StudioWorkspaceMode | null {
  if (value === "images") return "image";
  if (value === "voice") return "audio";
  if (value === "documents" || value === "analyze" || value === "code") return value;
  return MODES.some((mode) => mode.key === value) ? value as StudioMode : null;
}

function parseView(value: string | null): StudioView | null {
  return value === "tools" || value === "apps" || value === "community" ? value : null;
}
