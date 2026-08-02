// Single source of truth for "which persistent-shell section does this
// pathname belong to" — workspace-shell.tsx, nav.tsx, route-transition.tsx,
// and zone.tsx each used to re-derive this independently via their own
// pathname.startsWith(...) checks.
export type WorkspaceSectionKey =
  | "chat"
  | "agents"
  | "knowledge"
  | "studio"
  | "tools"
  | "home"
  | "profile"
  | "history"
  | "pricing"
  | "usage"
  | "automations";

export interface WorkspaceSection {
  key: WorkspaceSectionKey;
  prefix: string;
}

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  { key: "chat", prefix: "/chat" },
  { key: "agents", prefix: "/agents" },
  { key: "knowledge", prefix: "/knowledge" },
  { key: "studio", prefix: "/studio" },
  { key: "tools", prefix: "/tools" },
  { key: "home", prefix: "/home" },
  { key: "profile", prefix: "/profile" },
  { key: "history", prefix: "/history" },
  { key: "pricing", prefix: "/pricing" },
  { key: "usage", prefix: "/usage" },
  { key: "automations", prefix: "/automations" },
];

export function getWorkspaceSection(pathname: string): WorkspaceSection | null {
  return WORKSPACE_SECTIONS.find(
    (section) => pathname === section.prefix || pathname.startsWith(`${section.prefix}/`),
  ) ?? null;
}

export function isWorkspaceRoute(pathname: string): boolean {
  return getWorkspaceSection(pathname) !== null;
}
