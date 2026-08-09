import path from "node:path";

export const REFERENCE_VIEWPORT = Object.freeze({ width: 1586, height: 992 });

export const REFERENCE_ROUTES = Object.freeze([
  Object.freeze({ name: "chat", path: "/chat", landmark: "Чат Lumenza" }),
  Object.freeze({ name: "agents", path: "/agents", landmark: "Agents workspace" }),
  Object.freeze({ name: "studio", path: "/studio", landmark: "Image workspace" }),
  Object.freeze({ name: "account", path: "/profile", landmark: "Настройки профиля" }),
  Object.freeze({ name: "knowledge", path: "/knowledge", landmark: "Библиотека знаний" }),
  Object.freeze({ name: "all-tools", path: "/tools", landmark: "Все инструменты Lumenza" }),
]);

export function parseE2EPort(value) {
  const port = value ?? "3100";
  if (!/^\d{1,5}$/.test(port)) {
    throw new Error("E2E_PORT must be an integer between 1 and 65535");
  }
  const numericPort = Number(port);
  if (numericPort < 1 || numericPort > 65_535) {
    throw new Error("E2E_PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function requireE2ECredentials(username, password) {
  if (!username || !password) {
    throw new Error(
      "LUMENZA_TEST_USERNAME and LUMENZA_TEST_PASSWORD are required",
    );
  }
  return Object.freeze({ username, password });
}

export function isExpectedPreviewConsoleError(message) {
  return message.includes("418 (Local Preview Transport)");
}

export function validateReferenceRoutes(routes = REFERENCE_ROUTES) {
  const errors = [];
  const names = new Set();
  const paths = new Set();

  for (const route of routes) {
    if (names.has(route.name)) errors.push(`Duplicate route name: ${route.name}`);
    if (paths.has(route.path)) errors.push(`Duplicate route path: ${route.path}`);
    if (!route.path.startsWith("/")) {
      errors.push(`Route path must start with '/': ${route.path}`);
    }
    if (!route.landmark.trim()) {
      errors.push(`Route landmark is required: ${route.name}`);
    }
    names.add(route.name);
    paths.add(route.path);
  }

  return { valid: errors.length === 0, errors };
}

export function resolveVisualAuditPaths(frontendRoot) {
  const referenceRoot = path.resolve(frontendRoot, "..", "docs", "redesign-references");
  const auditRoot = path.resolve(frontendRoot, "test-results", "visual-audit");

  return {
    approvedDir: path.join(referenceRoot, "approved"),
    currentDir: path.join(auditRoot, "current"),
    diffDir: path.join(auditRoot, "diff"),
    overlayDir: path.join(auditRoot, "overlay"),
    reportPath: path.join(auditRoot, "report.json"),
  };
}
