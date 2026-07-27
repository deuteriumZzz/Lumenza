import { describe, expect, it } from "vitest";
import { getWorkspaceSection, isWorkspaceRoute } from "@/lib/workspace-sections";

describe("getWorkspaceSection", () => {
  it.each([
    ["/chat", "chat"],
    ["/chat/42", "chat"],
    ["/agents", "agents"],
    ["/agents/threads-content-day", "agents"],
    ["/studio", "studio"],
    ["/studio/images", "studio"],
    ["/home", "home"],
  ] as const)("maps %s to the %s section", (pathname, key) => {
    expect(getWorkspaceSection(pathname)?.key).toBe(key);
  });

  it("returns null for a non-workspace pathname", () => {
    expect(getWorkspaceSection("/pricing")).toBeNull();
    expect(getWorkspaceSection("/")).toBeNull();
  });
});

describe("isWorkspaceRoute", () => {
  it("is true for every workspace section", () => {
    expect(isWorkspaceRoute("/chat")).toBe(true);
    expect(isWorkspaceRoute("/agents")).toBe(true);
    expect(isWorkspaceRoute("/studio")).toBe(true);
    expect(isWorkspaceRoute("/home")).toBe(true);
  });

  it("is false for non-workspace pathnames", () => {
    expect(isWorkspaceRoute("/history")).toBe(false);
    expect(isWorkspaceRoute("/pricing")).toBe(false);
  });
});
