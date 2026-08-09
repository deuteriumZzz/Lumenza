// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  REFERENCE_ROUTES,
  REFERENCE_VIEWPORT,
  isExpectedPreviewConsoleError,
  parseE2EPort,
  requireE2ECredentials,
  resolveVisualAuditPaths,
  validateReferenceRoutes,
} from "./visual-audit-config.mjs";

describe("visual audit configuration", () => {
  it("locks the audit to the six approved reference routes", () => {
    expect(REFERENCE_ROUTES).toEqual([
      { name: "chat", path: "/chat", landmark: "Чат Lumenza" },
      { name: "agents", path: "/agents", landmark: "Agents workspace" },
      { name: "studio", path: "/studio", landmark: "Image workspace" },
      { name: "account", path: "/profile", landmark: "Настройки профиля" },
      { name: "knowledge", path: "/knowledge", landmark: "Библиотека знаний" },
      { name: "all-tools", path: "/tools", landmark: "Все инструменты Lumenza" },
    ]);
    expect(validateReferenceRoutes()).toEqual({ valid: true, errors: [] });
  });

  it("uses the exact approved screenshot dimensions", () => {
    expect(REFERENCE_VIEWPORT).toEqual({ width: 1586, height: 992 });
  });

  it("accepts only a valid TCP port for the local test server", () => {
    expect(parseE2EPort(undefined)).toBe("3100");
    expect(parseE2EPort("4310")).toBe("4310");
    expect(() => parseE2EPort("3100; touch /tmp/injected")).toThrow(
      "E2E_PORT must be an integer between 1 and 65535",
    );
    expect(() => parseE2EPort("0")).toThrow(
      "E2E_PORT must be an integer between 1 and 65535",
    );
    expect(() => parseE2EPort("65536")).toThrow(
      "E2E_PORT must be an integer between 1 and 65535",
    );
  });

  it("fails closed when seeded E2E credentials are absent", () => {
    expect(requireE2ECredentials("audit-user", "secret-value")).toEqual({
      username: "audit-user",
      password: "secret-value",
    });
    expect(() => requireE2ECredentials(undefined, "secret-value")).toThrow(
      "LUMENZA_TEST_USERNAME and LUMENZA_TEST_PASSWORD are required",
    );
    expect(() => requireE2ECredentials("audit-user", "")).toThrow(
      "LUMENZA_TEST_USERNAME and LUMENZA_TEST_PASSWORD are required",
    );
  });

  it("rejects duplicate names, paths and invalid routes", () => {
    expect(
      validateReferenceRoutes([
        { name: "chat", path: "/chat", landmark: "Chat" },
        { name: "chat", path: "agents", landmark: "" },
      ]),
    ).toEqual({
      valid: false,
      errors: [
        "Duplicate route name: chat",
        "Route path must start with '/': agents",
        "Route landmark is required: chat",
      ],
    });
  });

  it("keeps generated artifacts separate from approved references", () => {
    const paths = resolveVisualAuditPaths("/workspace/frontend");

    expect(paths.approvedDir).toBe(
      "/workspace/docs/redesign-references/approved",
    );
    expect(paths.currentDir).toBe(
      "/workspace/frontend/test-results/visual-audit/current",
    );
    expect(paths.diffDir).toBe(
      "/workspace/frontend/test-results/visual-audit/diff",
    );
    expect(paths.overlayDir).toBe(
      "/workspace/frontend/test-results/visual-audit/overlay",
    );
    expect(paths.reportPath).toBe(
      "/workspace/frontend/test-results/visual-audit/report.json",
    );
  });

  it("ignores only the intentional local preview transport status", () => {
    expect(
      isExpectedPreviewConsoleError(
        "Failed to load resource: the server responded with a status of 418 (Local Preview Transport)",
      ),
    ).toBe(true);
    expect(
      isExpectedPreviewConsoleError(
        "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
      ),
    ).toBe(false);
    expect(isExpectedPreviewConsoleError("Hydration failed")).toBe(false);
  });
});
