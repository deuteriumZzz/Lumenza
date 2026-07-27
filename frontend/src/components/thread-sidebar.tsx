"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { motionTokens, springs } from "@/lib/motion";
import { api, apiErrorMessage, type ChatThread, type Paginated } from "@/lib/api";
import { AccountMenu } from "@/components/account-menu";
import { AppearanceControl } from "@/components/appearance-control";
import { LumenzaBrand } from "@/components/lumenza-brand";
import { StudioMark } from "@/components/studio-mark";

const SIDEBAR_STORAGE_KEY = "lumenza:sidebar-collapsed";

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
  const studioActive = pathname.startsWith("/studio");
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

  // Рефетч при каждой смене pathname внутри /chat — самый простой способ
  // подхватить только что созданный тред (ChatThreadView создаёт его и сам
  // роутится на /chat/<id>, отдельного паб/саб-механизма в проекте нет, а
  // заводить его ради одного списка — overkill). Список маленький и
  // пагинированный, лишний повторный запрос дёшев.
  useEffect(() => {
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
  }, [pathname]);

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
        href="/chat"
        aria-label={collapsed ? "Новый чат" : undefined}
        title={collapsed ? "Новый чат (⌘K)" : undefined}
        className={`sidebar-new-chat ${collapsed ? "justify-center px-0" : ""}`}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 20H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h7" />
          <path d="m15 5 4 4M14 10l5.5-5.5a1.4 1.4 0 0 1 2 2L16 12l-4 1 1-4Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {!collapsed && (
          <>
            <span>Новый чат</span>
            <kbd className="ml-auto text-[10px] text-muted">⌘K</kbd>
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
          <SidebarRailLink href="/agents" label="Агенты" icon="agents" />
          <SidebarRailLink href="/studio" label="Студия" icon="studio" />
          <SidebarRailLink href="/history" label="История" icon="history" />
        </nav>
      ) : (
        <>
          <nav aria-label="Разделы" className="mb-4 flex flex-col gap-0.5">
            <SidebarLink href="/agents" label="Агенты" icon="agents" />
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
                      <StudioCategoryLink
                        href="/studio?mode=images"
                        label="Создание"
                        description="Картинки и голос"
                      />
                      <StudioCategoryLink
                        href="/studio?mode=documents"
                        label="Работа"
                        description="Документы"
                      />
                      <StudioCategoryLink
                        href="/studio?mode=analyze"
                        label="Исследование"
                        description="Анализ фото"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <SidebarLink href="/history" label="История" icon="history" />
            <SidebarLink href="/pricing" label="Тариф и кредиты" icon="credits" />
          </nav>

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
  icon: "agents" | "studio" | "history" | "credits";
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
  return (
    <Link href={href} className="studio-category-link">
      <span aria-hidden="true" className="studio-category-node" />
      <span className="min-w-0">
        <span className="block text-[13px] leading-4 text-ink/90">{label}</span>
        <span className="block truncate text-[10px] leading-4 text-muted">
          {description}
        </span>
      </span>
    </Link>
  );
}

function SidebarRailLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: "agents" | "studio" | "history";
}) {
  return (
    <Link href={href} aria-label={label} title={label} className="sidebar-icon-button">
      <SidebarIcon icon={icon} />
    </Link>
  );
}

function SidebarIcon({ icon }: { icon: "agents" | "studio" | "history" | "credits" }) {
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
  if (icon === "studio") {
    return <StudioMark className="size-4.5 shrink-0" />;
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
