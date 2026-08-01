"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { api, apiErrorMessage, type ChatThread, type Paginated } from "@/lib/api";
import { getWorkspaceSection } from "@/lib/workspace-sections";
import { AccountMenu } from "@/components/account-menu";
import { AppearanceControl } from "@/components/appearance-control";
import { LumenzaBrand } from "@/components/lumenza-brand";
import { StudioMark } from "@/components/studio-mark";

const SIDEBAR_STORAGE_KEY = "lumenza:sidebar-collapsed";

type SidebarIconName =
  | "chat"
  | "agents"
  | "knowledge"
  | "studio"
  | "automations"
  | "history"
  | "credits"
  | "tools"
  | "apps"
  | "community";

// Порядок — то же 3-стороннее переключение, что у abacus.ai (Chat Mode |
// AI Agent | Company Knowledge, SPEC.md Phase 17) — Студия остаётся
// отдельной строкой ниже, это не часть переключателя.
const MODE_SWITCHER_OPTIONS: { key: "chat" | "agents" | "knowledge"; href: string; label: string; icon: SidebarIconName }[] = [
  { key: "chat", href: "/chat", label: "Чат", icon: "chat" },
  { key: "agents", href: "/agents", label: "Агенты", icon: "agents" },
  { key: "knowledge", href: "/knowledge", label: "Знания", icon: "knowledge" },
];

function sidebarPreferenceKey(): string {
  const viewport =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 767px)").matches
      ? "mobile"
      : "desktop";
  return `${SIDEBAR_STORAGE_KEY}:${viewport}`;
}

function storedSidebarPreference(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(sidebarPreferenceKey());
    return value === null ? null : value === "true";
  } catch {
    return null;
  }
}

function persistSidebarPreference(value: boolean) {
  try {
    window.localStorage.setItem(sidebarPreferenceKey(), String(value));
  } catch {
    // Private/locked-down browser contexts may disable storage.
  }
}

export function ThreadSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const activeSection = getWorkspaceSection(pathname)?.key;
  const studioActive = activeSection === "studio";
  const [result, setResult] = useState<Paginated<ChatThread> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => storedSidebarPreference() ?? false);
  const [studioFolderState, setStudioFolderState] = useState({
    pathname,
    open: studioActive,
  });
  const [initializing, setInitializing] = useState(true);

  if (studioFolderState.pathname !== pathname) {
    setStudioFolderState({
      pathname,
      open: studioActive,
    });
  }

  const studioOpen = studioFolderState.open;
  const activeThreadId = pathname.startsWith("/chat/") ? pathname.slice("/chat/".length) : null;
  const showsChatHistory = activeSection === "chat";
  const primaryAction = activeSection === "agents"
    ? { href: "/agents", label: "Новый запуск агента" }
    : activeSection === "studio"
      ? { href: "/studio", label: "Новый проект" }
      : { href: "/chat", label: "Новый чат" };

  // Рефетч при каждой смене pathname внутри /chat — самый простой способ
  // подхватить только что созданный тред (ChatThreadView создаёт его и сам
  // роутится на /chat/<id>, отдельного паб/саб-механизма в проекте нет, а
  // заводить его ради одного списка — overkill). Список маленький и
  // пагинированный, лишний повторный запрос дёшев.
  useEffect(() => {
    if (!showsChatHistory) return;
    let cancelled = false;
    api.threads().then(
      (data) => {
        if (!cancelled) setResult(data);
      },
      (err) => {
        if (!cancelled) setError(apiErrorMessage(err, "Не удалось загрузить чаты."));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [pathname, showsChatHistory]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (
        storedSidebarPreference() === null &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 767px)").matches
      ) {
        setCollapsed(true);
      }
      setInitializing(false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "b") {
        return;
      }
      event.preventDefault();
      setCollapsed((current) => {
        const next = !current;
        persistSidebarPreference(next);
        return next;
      });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      persistSidebarPreference(next);
      return next;
    });
  }

  async function handleDelete(id: number, event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await api.deleteThread(id);
      setResult((prev) => (prev ? { ...prev, results: prev.results.filter((t) => t.id !== id) } : prev));
      if (activeThreadId === String(id)) router.push("/chat");
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось удалить чат."));
    }
  }

  return (
    <aside
      id="thread-sidebar"
      data-collapsed={collapsed}
      className={`chat-sidebar ${collapsed ? "is-collapsed" : ""} ${initializing ? "is-initializing" : ""}`}
    >
      <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "justify-between px-1"}`}>
        {!collapsed && (
          <LumenzaBrand href="/home" />
        )}
        <button
          type="button"
          aria-label={collapsed ? "Показать боковую панель" : "Свернуть боковую панель"}
          aria-controls="thread-sidebar-navigation"
          aria-expanded={!collapsed}
          title={`${collapsed ? "Показать" : "Свернуть"} боковую панель (⌘B)`}
          onClick={toggleCollapsed}
          className="sidebar-icon-button"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.65">
            <rect x="3.5" y="4" width="17" height="16" rx="3" />
            <path d="M9 4v16" />
            <path d={collapsed ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <Link
        href={primaryAction.href}
        aria-label={collapsed ? primaryAction.label : undefined}
        title={collapsed ? primaryAction.label : undefined}
        className={`sidebar-new-chat ${collapsed ? "justify-center px-0" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 20H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
          <path d="m15 5 4 4M14 10l5.5-5.5a1.4 1.4 0 0 1 2 2L16 12l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && (
          <>
            <span>{primaryAction.label}</span>
            {showsChatHistory && <kbd className="ml-auto text-[10px] text-muted">⌘K</kbd>}
          </>
        )}
      </Link>

      {!collapsed && error && (
        <p role="alert" className="mb-2 px-2 text-xs text-danger">
          {error}
        </p>
      )}

      {collapsed ? (
        <nav aria-label="Разделы" className="flex flex-col items-center gap-1">
          <SidebarRailLink href="/chat" label="Чат" icon="chat" />
          <SidebarRailLink href="/agents" label="Агенты" icon="agents" />
          <SidebarRailLink href="/knowledge" label="Знания" icon="knowledge" />
          <SidebarRailLink href="/studio" label="Студия" icon="studio" />
          <SidebarRailLink href="/automations" label="Автоматизации" icon="automations" />
          <SidebarRailLink href="/history" label="История" icon="history" />
        </nav>
      ) : (
        <>
          <nav
            aria-label="Режим"
            className="mb-2 flex items-center gap-1 rounded-2xl border border-border/70 bg-surface/60 p-1"
          >
            {MODE_SWITCHER_OPTIONS.map((option) => {
              const active = activeSection === option.key;
              return (
                <Link
                  key={option.key}
                  href={option.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative isolate flex min-h-9 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-2 text-xs font-medium transition-colors duration-150 ${
                    active ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-mode-switcher"
                      aria-hidden="true"
                      className="absolute inset-0 -z-10 rounded-xl bg-primary/12"
                      transition={shouldReduceMotion ? { duration: 0 } : springs.snappy}
                    />
                  )}
                  <SidebarIcon icon={option.icon} />
                  <span>{option.label}</span>
                </Link>
              );
            })}
          </nav>

          <nav aria-label="Разделы" className="mb-4 flex flex-col gap-0.5">
            <div>
              <div
                className={`studio-folder-row ${studioActive ? "is-active" : ""}`}
              >
                <Link
                  href="/studio"
                  aria-current={studioActive ? "page" : undefined}
                  className="studio-folder-link"
                >
                  <StudioMark
                    active={studioActive}
                    className="size-4.5 shrink-0"
                  />
                  <span>Студия</span>
                </Link>
                <button
                  type="button"
                  aria-label={
                    studioOpen
                      ? "Свернуть категории Студии"
                      : "Развернуть категории Студии"
                  }
                  aria-controls="studio-sidebar-categories"
                  aria-expanded={studioOpen}
                  onClick={() =>
                    setStudioFolderState((current) => ({
                      ...current,
                      open: !current.open,
                    }))
                  }
                  className="studio-folder-toggle"
                >
                  <motion.svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    animate={{ rotate: studioOpen ? 90 : 0 }}
                    transition={{
                      duration: shouldReduceMotion
                        ? 0
                        : motionTokens.duration.fast,
                      ease: motionTokens.easing.smooth,
                    }}
                  >
                    <path
                      d="m7.5 5.5 4.5 4.5-4.5 4.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </motion.svg>
                </button>
              </div>

              <AnimatePresence initial={false}>
                {studioOpen && (
                  <motion.div
                    id="studio-sidebar-categories"
                    initial={
                      shouldReduceMotion
                        ? false
                        : { height: 0, opacity: 0, y: -motionTokens.distance.xs }
                    }
                    animate={{ height: "auto", opacity: 1, y: 0 }}
                    exit={
                      shouldReduceMotion
                        ? { height: 0 }
                        : { height: 0, opacity: 0, y: -motionTokens.distance.xs }
                    }
                    transition={{
                      duration: shouldReduceMotion
                        ? 0
                        : motionTokens.duration.fast,
                      ease: motionTokens.easing.smooth,
                    }}
                    className="overflow-hidden"
                  >
                    <div className="studio-folder-tree">
                      <StudioCategoryLink href="/studio?mode=image" label="Image" description="Generate visuals" />
                      <StudioCategoryLink href="/studio?mode=video" label="Video" description="Motion workspace" />
                      <StudioCategoryLink href="/studio?mode=audio" label="Audio" description="Voice and speech" />
                      <StudioCategoryLink href="/studio?mode=edit" label="Edit" description="Transform media" />
                      <StudioCategoryLink href="/studio?mode=upscale" label="Upscale" description="Recover detail" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <p className="sidebar-section-label">Apps</p>
            <StudioOverviewLink href="/studio?view=tools" label="All Tools" icon="tools" />
            <StudioOverviewLink href="/studio?view=apps" label="Apps" icon="apps" />
            <SidebarLink href="/studio?view=community" label="Community" icon="community" />
            <SidebarLink href="/automations" label="Автоматизации" icon="automations" />
            <SidebarLink href="/history" label="История" icon="history" />
            <SidebarLink href="/pricing" label="Тариф и кредиты" icon="credits" />
          </nav>

          {showsChatHistory ? <>
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">Недавние</p>
            <kbd className="text-[10px] text-muted">⌘B</kbd>
          </div>
          <nav id="thread-sidebar-navigation" aria-label="Чаты" className="min-h-0 flex-1 overflow-y-auto">
            {result === null ? (
              <div className="space-y-2 px-2 py-1" aria-label="Загрузка чатов">
                <span className="block h-7 animate-pulse rounded-lg bg-surface-raised/70" />
                <span className="block h-7 animate-pulse rounded-lg bg-surface-raised/50" />
              </div>
            ) : result.results.length === 0 ? (
              <p className="px-2 text-xs leading-5 text-muted">
                Диалоги появятся здесь после первого сообщения.
              </p>
            ) : (
              <ol className="flex flex-col gap-0.5">
                {result.results.map((thread) => {
                  const active = activeThreadId === String(thread.id);
                  return (
                    <motion.li
                      key={thread.id}
                      initial={{ opacity: 0, y: motionTokens.distance.sm }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={springs.gentle}
                      className={`group flex items-center rounded-lg pr-1 ${
                        active ? "bg-surface-raised text-ink" : "text-muted hover:bg-surface hover:text-ink"
                      }`}
                    >
                      <Link
                        href={`/chat/${thread.id}`}
                        aria-current={active ? "page" : undefined}
                        className="min-w-0 flex-1 truncate px-2.5 py-2 text-sm"
                      >
                        {thread.title || "Новый чат"}
                      </Link>
                      <button
                        type="button"
                        onClick={(event) => void handleDelete(thread.id, event)}
                        aria-label={`Удалить чат «${thread.title || "Новый чат"}»`}
                        title="Удалить чат"
                        className="shrink-0 rounded-md p-1 text-muted opacity-50 transition hover:bg-bg/50 hover:text-danger focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="M6 6l12 12" strokeLinecap="round" />
                          <path d="M18 6L6 18" strokeLinecap="round" />
                        </svg>
                      </button>
                    </motion.li>
                  );
                })}
              </ol>
            )}
          </nav>
          </> : <div className="min-h-4 flex-1" aria-hidden="true" />}
        </>
      )}

      <div
        className={`mt-auto flex flex-col gap-0.5 border-t border-border/70 pt-2 ${collapsed ? "items-center" : ""}`}
      >
        <AppearanceControl compact={collapsed} />
        <AccountMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: SidebarIconName;
}) {
  return (
    <Link href={href} className="sidebar-action">
      <SidebarIcon icon={icon} />
      <span>{label}</span>
    </Link>
  );
}

function StudioCategoryLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  const items = STUDIO_FLYOUTS[label] ?? [];
  return (
    <StudioFlyoutRoot label={`${label} tools`} items={items}>
      <Link href={href} className="studio-category-link">
        <span aria-hidden="true" className="studio-category-node" />
        <span className="min-w-0">
          <span className="block text-[13px] leading-4 text-ink/90">{label}</span>
          <span className="block truncate text-[10px] leading-4 text-muted">
            {description}
          </span>
        </span>
      </Link>
    </StudioFlyoutRoot>
  );
}

const STUDIO_FLYOUTS: Record<string, { label: string; href: string; status?: string }[]> = {
  Image: [
    { label: "Create image", href: "/studio?mode=image" },
    { label: "Edit image", href: "/studio?mode=edit" },
    { label: "Style reference", href: "/studio?mode=image", status: "Preview" },
    { label: "Inpaint", href: "/studio?mode=edit" },
  ],
  Video: [
    { label: "Create video", href: "/studio?mode=video", status: "Soon" },
    { label: "Animate image", href: "/studio?mode=video", status: "Soon" },
    { label: "Motion control", href: "/studio?mode=video", status: "Soon" },
  ],
  Audio: [
    { label: "Text to speech", href: "/studio?mode=audio" },
    { label: "Transcription", href: "/studio?mode=audio" },
    { label: "Voice cloning", href: "/studio?mode=audio", status: "Soon" },
  ],
  Edit: [
    { label: "Edit image", href: "/studio?mode=edit" },
    { label: "Inpaint", href: "/studio?mode=edit" },
    { label: "Outpaint", href: "/studio?mode=edit", status: "Preview" },
    { label: "Camera angles", href: "/studio?mode=edit", status: "Preview" },
  ],
  Upscale: [
    { label: "Topaz", href: "/studio?mode=upscale", status: "Soon" },
    { label: "Magnific Precision", href: "/studio?mode=upscale", status: "Soon" },
    { label: "Face recovery", href: "/studio?mode=upscale", status: "Soon" },
  ],
  "All Tools": [
    { label: "Image tools", href: "/studio?mode=image" },
    { label: "Video tools", href: "/studio?mode=video", status: "Preview" },
    { label: "Audio tools", href: "/studio?mode=audio" },
    { label: "Show all", href: "/studio?view=tools" },
  ],
  Apps: [
    { label: "Campaign canvas", href: "/studio?view=apps" },
    { label: "Portrait lab", href: "/studio?view=apps" },
    { label: "Product stories", href: "/studio?view=apps" },
  ],
};

function StudioOverviewLink({ href, label, icon }: { href: string; label: "All Tools" | "Apps"; icon: SidebarIconName }) {
  return (
    <StudioFlyoutRoot label={`${label} overview`} items={STUDIO_FLYOUTS[label]}>
      <Link href={href} className="sidebar-action">
        <SidebarIcon icon={icon} />
        <span>{label}</span>
      </Link>
    </StudioFlyoutRoot>
  );
}

function StudioFlyoutRoot({ label, items, children }: { label: string; items: { label: string; href: string; status?: string }[]; children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      requestAnimationFrame(() => {
        rootRef.current?.querySelector<HTMLElement>(":scope > a, :scope > button")?.focus();
      });
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="sidebar-studio-flyout-root"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.aside
            role="dialog"
            aria-label={label}
            initial={shouldReduceMotion ? false : { opacity: 0, x: -8, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -6, scale: 0.99 }}
            transition={shouldReduceMotion ? { duration: 0 } : springs.snappy}
            className="sidebar-studio-flyout"
          >
            <p>{label}</p>
            <div>
              {items.map((item) => (
                <Link key={item.label} href={item.href} aria-label={item.label}>
                  <span aria-hidden="true">◇</span>
                  <strong>{item.label}</strong>
                  {item.status && <em>{item.status}</em>}
                </Link>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarRailLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: SidebarIconName;
}) {
  return (
    <Link href={href} aria-label={label} title={label} className="sidebar-icon-button">
      <SidebarIcon icon={icon} />
    </Link>
  );
}

function SidebarIcon({
  icon,
}: {
  icon: SidebarIconName;
}) {
  if (icon === "chat") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path
          d="M4 12c0-4.4 3.6-8 8-8s8 3.6 8 8-3.6 8-8 8c-1.1 0-2.1-.2-3-.6L4 20l1.1-4.4A7.9 7.9 0 0 1 4 12Z"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (icon === "agents") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="6" cy="7" r="2.25" />
        <circle cx="18" cy="7" r="2.25" />
        <circle cx="12" cy="17.5" r="2.25" />
        <path d="M7.8 8.6 10.4 15.7M16.2 8.6 13.6 15.7M8.25 7h7.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "knowledge") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
        <path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z" />
      </svg>
    );
  }
  if (icon === "studio") {
    return <StudioMark className="size-4.5 shrink-0" />;
  }
  if (icon === "tools") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="6" cy="6" r="1.5" /><circle cx="12" cy="6" r="1.5" /><circle cx="18" cy="6" r="1.5" />
        <circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" />
        <circle cx="6" cy="18" r="1.5" /><circle cx="12" cy="18" r="1.5" /><circle cx="18" cy="18" r="1.5" />
      </svg>
    );
  }
  if (icon === "apps") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" /><path d="M17 14v6m-3-3h6" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "community") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="9" cy="9" r="3" /><circle cx="17" cy="8" r="2" />
        <path d="M3.5 19c.6-3 2.5-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 13.5c2.8 0 4.5 1.2 5 3.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (icon === "automations") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (icon === "history") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4.5 9a8 8 0 1 1-.3 5" strokeLinecap="round" />
        <path d="M4.5 4.5V9H9M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
      <path d="M3.5 10h17M7 14.5h3" strokeLinecap="round" />
    </svg>
  );
}
