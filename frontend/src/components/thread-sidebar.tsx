"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { AccountMenu } from "@/components/account-menu";
import { LumenzaBrand } from "@/components/lumenza-brand";
import { StudioMark } from "@/components/studio-mark";
import { springs } from "@/lib/motion";
import { getWorkspaceSection, type WorkspaceSectionKey } from "@/lib/workspace-sections";

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

interface FlyoutItem {
  label: string;
  description: string;
  href: string;
  status?: string;
}

interface SidebarItem {
  key: string;
  href: string;
  label: string;
  icon: SidebarIconName;
  section?: WorkspaceSectionKey;
  flyoutLabel?: string;
  flyout?: FlyoutItem[];
}

// Each flyout below covers a different slice of the product on purpose —
// Studio's own five creative modes, All Tools' cross-workspace catalog
// categories (research/writing/code/etc., not the same five modes again),
// and Apps' ready-made multi-step recipes — so hovering three sidebar
// items in a row never shows the same six links reworded three times.
const STUDIO_TOOLS: FlyoutItem[] = [
  { label: "Create image", description: "Создание изображений из текста", href: "/studio?mode=image" },
  { label: "Create video", description: "Видео и анимация кадров", href: "/studio?mode=video", status: "Preview" },
  { label: "Text to speech", description: "Озвучка, голоса и аудио", href: "/studio?mode=audio" },
  { label: "Edit image", description: "Inpaint, replace и расширение", href: "/studio?mode=edit" },
  { label: "Upscale", description: "Повышение детализации", href: "/studio?mode=upscale", status: "Preview" },
  { label: "Community", description: "Работы и промпты сообщества", href: "/studio?view=community" },
];

const ALL_TOOLS: FlyoutItem[] = [
  { label: "Research & insights", description: "Проверенные источники и выводы", href: "/tools?category=Research" },
  { label: "Content creation", description: "Статьи, посты, публикации", href: "/tools?category=Writing" },
  { label: "Code assistant", description: "Написание и отладка кода", href: "/tools?category=Code" },
  { label: "Document intelligence", description: "Извлечение и суммаризация", href: "/tools?category=Documents" },
  { label: "Automation builder", description: "Повторяемые сценарии", href: "/tools?category=Automation" },
  { label: "Весь каталог", description: "Все инструменты Lumenza", href: "/tools" },
];

const APP_TOOLS: FlyoutItem[] = [
  { label: "Campaign canvas", description: "Серия визуалов из одной идеи", href: "/studio?view=apps&app=campaign-canvas" },
  { label: "Portrait lab", description: "Персонажи и портретные серии", href: "/studio?view=apps&app=portrait-lab" },
  { label: "Launch kit", description: "Комплект визуалов и текстов", href: "/studio?view=apps&app=launch-kit" },
];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: "chat", href: "/chat", label: "Чат", icon: "chat", section: "chat" },
  { key: "agents", href: "/agents", label: "Агенты", icon: "agents", section: "agents" },
  { key: "knowledge", href: "/knowledge", label: "Знания", icon: "knowledge", section: "knowledge" },
  { key: "studio", href: "/studio", label: "Студия", icon: "studio", section: "studio", flyoutLabel: "Studio tools", flyout: STUDIO_TOOLS },
  { key: "automations", href: "/automations", label: "Автоматизации", icon: "automations", section: "automations" },
  { key: "history", href: "/history", label: "История", icon: "history", section: "history" },
  { key: "tools", href: "/tools", label: "All Tools", icon: "tools", section: "tools", flyoutLabel: "All Tools overview", flyout: ALL_TOOLS },
  { key: "apps", href: "/studio?view=apps", label: "Apps", icon: "apps", flyoutLabel: "Apps overview", flyout: APP_TOOLS },
  { key: "community", href: "/studio?view=community", label: "Community", icon: "community" },
];

function sidebarPreferenceKey(): string {
  const viewport = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 767px)").matches
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
    // Storage can be unavailable in locked-down browser contexts.
  }
}

export function ThreadSidebar() {
  const pathname = usePathname();
  const activeSection = getWorkspaceSection(pathname)?.key;
  // Starts at the server-safe default (false) so the first client render
  // matches SSR exactly — reading localStorage synchronously here would
  // make the client's initial render diverge from the server's whenever a
  // stored preference exists, causing a hydration mismatch. The real
  // preference (stored value, or the mobile no-preference default) is
  // applied a frame later via the effect below; `is-initializing` (see
  // globals.css) keeps that brief window from flashing wide on mobile.
  const [collapsed, setCollapsed] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = storedSidebarPreference();
      if (stored !== null) {
        setCollapsed(stored);
      } else if (
        typeof window.matchMedia === "function"
        && window.matchMedia("(max-width: 767px)").matches
      ) {
        setCollapsed(true);
      }
      setInitializing(false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "b") return;
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

  return (
    <aside
      id="thread-sidebar"
      data-collapsed={collapsed}
      className={`chat-sidebar ${collapsed ? "is-collapsed" : ""} ${initializing ? "is-initializing" : ""}`}
    >
      <div className={`mb-3 flex items-center ${collapsed ? "justify-center" : "justify-between px-1"}`}>
        {!collapsed && <LumenzaBrand href="/chat" />}
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

      <nav id="thread-sidebar-navigation" aria-label="Разделы" className={`mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto ${collapsed ? "items-center" : ""}`}>
        {SIDEBAR_ITEMS.map((item) => (
          <SidebarNavigationItem
            key={item.key}
            item={item}
            active={item.section === activeSection}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className={`mt-auto border-t border-border/70 pt-2 ${collapsed ? "flex flex-col items-center" : ""}`}>
        <AccountMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

function SidebarNavigationItem({ item, active, collapsed }: { item: SidebarItem; active: boolean; collapsed: boolean }) {
  const renderLink = (flyout?: { open: boolean; id: string }) => (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-haspopup={flyout ? "dialog" : undefined}
      aria-expanded={flyout ? flyout.open : undefined}
      aria-controls={flyout?.id}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      data-sidebar-motion="spring"
      className={collapsed ? "sidebar-icon-button" : `sidebar-action sidebar-navigation-link ${active ? "is-active" : ""}`}
    >
      {!collapsed && active && (
        <motion.span layoutId="sidebar-active-item" aria-hidden="true" className="sidebar-active-indicator" transition={springs.snappy} />
      )}
      <span className="sidebar-navigation-icon"><SidebarIcon icon={item.icon} active={active} /></span>
      {!collapsed && <span className="relative z-10">{item.label}</span>}
    </Link>
  );

  if (collapsed || !item.flyout || !item.flyoutLabel) return renderLink();
  const flyoutId = `sidebar-flyout-${item.key}`;
  return (
    <SidebarFlyoutRoot key={item.key} id={flyoutId} label={item.flyoutLabel} items={item.flyout} testId={`sidebar-item-${item.key}`}>
      {(open) => renderLink({ open, id: flyoutId })}
    </SidebarFlyoutRoot>
  );
}

function SidebarFlyoutRoot({ id, label, items, testId, children }: { id: string; label: string; items: FlyoutItem[]; testId: string; children: (open: boolean) => React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const restoringFocusRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      restoringFocusRef.current = true;
      requestAnimationFrame(() => rootRef.current?.querySelector<HTMLElement>(":scope > a")?.focus());
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div
      ref={rootRef}
      data-testid={testId}
      className="sidebar-studio-flyout-root"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => {
        if (restoringFocusRef.current) {
          restoringFocusRef.current = false;
          return;
        }
        setOpen(true);
      }}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    >
      {children(open)}
      <AnimatePresence>
        {open && (
          <motion.aside
            id={id}
            role="dialog"
            aria-label={label}
            initial={shouldReduceMotion ? false : { opacity: 0, x: -10, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: -8, scale: 0.99 }}
            transition={shouldReduceMotion ? { duration: 0 } : springs.snappy}
            className="sidebar-studio-flyout"
          >
            <div className="sidebar-flyout-heading">
              <span>Explore</span>
              <strong>{label}</strong>
            </div>
            <div className="sidebar-flyout-grid">
              {items.map((entry) => (
                <Link key={entry.label} href={entry.href} aria-label={entry.label}>
                  <span aria-hidden="true">◇</span>
                  <span className="min-w-0 flex-1">
                    <strong>{entry.label}</strong>
                    <small>{entry.description}</small>
                  </span>
                  {entry.status && <em>{entry.status}</em>}
                </Link>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarIcon({ icon, active = false }: { icon: SidebarIconName; active?: boolean }) {
  if (icon === "studio") return <StudioMark active={active} className="size-4.5 shrink-0" />;
  const common = { viewBox: "0 0 24 24", className: "size-4.5 shrink-0", fill: "none", stroke: "currentColor", strokeWidth: 1.6 };
  if (icon === "chat") return <svg aria-hidden="true" {...common}><path d="M4 12a8 8 0 1 1 5 7.4L4 20l1.1-4.4A8 8 0 0 1 4 12Z" strokeLinejoin="round" /></svg>;
  if (icon === "agents") return <svg aria-hidden="true" {...common}><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" strokeLinecap="round" /></svg>;
  if (icon === "knowledge") return <svg aria-hidden="true" {...common}><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5Zm16 0A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" /></svg>;
  if (icon === "tools") return <svg aria-hidden="true" {...common}><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
  if (icon === "apps") return <svg aria-hidden="true" {...common}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><path d="M17 14v6m-3-3h6" strokeLinecap="round" /></svg>;
  if (icon === "community") return <svg aria-hidden="true" {...common}><circle cx="9" cy="9" r="3" /><circle cx="17" cy="8" r="2" /><path d="M3.5 19c.6-3 2.5-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15 13.5c2.8 0 4.5 1.2 5 3.5" strokeLinecap="round" /></svg>;
  if (icon === "automations") return <svg aria-hidden="true" {...common}><path d="M12.5 3.5 5.5 13h5l-1 7.5 7-9.5h-5l1-7.5Z" strokeLinejoin="round" /></svg>;
  if (icon === "history") return <svg aria-hidden="true" {...common}><path d="M4.5 9a8 8 0 1 1-.3 5M4.5 4.5V9H9M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg aria-hidden="true" {...common}><rect x="3.5" y="5.5" width="17" height="13" rx="3" /><path d="M3.5 10h17M7 14.5h3" strokeLinecap="round" /></svg>;
}
