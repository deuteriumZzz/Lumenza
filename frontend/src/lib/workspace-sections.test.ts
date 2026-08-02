import { describe, expect, it } from "vitest";
import { getWorkspaceSection, isWorkspaceRoute } from "@/lib/workspace-sections";

describe("getWorkspaceSection", () => {
  it.each([
    ["/chat", "chat"],
    ["/chat/42", "chat"],
    ["/agents", "agents"],
    ["/agents/threads-content-day", "agents"],
    ["/knowledge", "knowledge"],
    ["/knowledge/42", "knowledge"],
    ["/studio", "studio"],
    ["/studio/images", "studio"],
    ["/tools", "tools"],
    ["/home", "home"],
    ["/profile", "profile"],
    ["/history", "history"],
    ["/pricing", "pricing"],
    ["/usage", "usage"],
    ["/automations", "automations"],
  ] as const)("maps %s to the %s section", (pathname, key) => {
    expect(getWorkspaceSection(pathname)?.key).toBe(key);
  });

  it("returns null for a non-workspace pathname", () => {
    expect(getWorkspaceSection("/login")).toBeNull();
    expect(getWorkspaceSection("/")).toBeNull();
    expect(getWorkspaceSection("/chatty")).toBeNull();
    expect(getWorkspaceSection("/agents-old")).toBeNull();
    expect(getWorkspaceSection("/studio-demo")).toBeNull();
  });
});

describe("isWorkspaceRoute", () => {
  it("is true for every workspace section", () => {
    expect(isWorkspaceRoute("/chat")).toBe(true);
    expect(isWorkspaceRoute("/agents")).toBe(true);
    expect(isWorkspaceRoute("/knowledge")).toBe(true);
    expect(isWorkspaceRoute("/studio")).toBe(true);
    expect(isWorkspaceRoute("/tools")).toBe(true);
    expect(isWorkspaceRoute("/home")).toBe(true);
    expect(isWorkspaceRoute("/profile")).toBe(true);
    expect(isWorkspaceRoute("/history")).toBe(true);
    expect(isWorkspaceRoute("/pricing")).toBe(true);
    expect(isWorkspaceRoute("/usage")).toBe(true);
    expect(isWorkspaceRoute("/automations")).toBe(true);
  });

  it("is false for non-workspace pathnames", () => {
    expect(isWorkspaceRoute("/login")).toBe(false);
  });
});
