// Single source of truth for "which persistent-shell section does this
// pathname belong to" — workspace-shell.tsx, nav.tsx, route-transition.tsx,
// and zone.tsx each used to re-derive this independently via their own
// pathname.startsWith(...) checks. Knowledge (Phase 17) isn't listed yet;
// adding it later is one entry here, not a hunt across those 4 files.
export type WorkspaceSectionKey = "chat" | "agents" | "studio" | "home";

export interface WorkspaceSection {
  key: WorkspaceSectionKey;
  prefix: string;
}

export const WORKSPACE_SECTIONS: WorkspaceSection[] = [
  { key: "chat", prefix: "/chat" },
  { key: "agents", prefix: "/agents" },
  { key: "studio", prefix: "/studio" },
  { key: "home", prefix: "/home" },
];

export function getWorkspaceSection(pathname: string): WorkspaceSection | null {
  return WORKSPACE_SECTIONS.find((section) => pathname.startsWith(section.prefix)) ?? null;
}

export function isWorkspaceRoute(pathname: string): boolean {
  return getWorkspaceSection(pathname) !== null;
}
