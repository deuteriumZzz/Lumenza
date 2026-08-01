import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

describe("Next.js development indicator", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("does not cover profile controls in the development UI", () => {
    expect(nextConfig.devIndicators).toBe(false);
  });

  it("preserves trailing slashes so API POST requests are not redirected", () => {
    expect(nextConfig.skipTrailingSlashRedirect).toBe(true);
  });

  it("does not advertise HSTS on a local HTTP preview", async () => {
    vi.stubEnv("LUMENZA_TLS_TERMINATED", "false");
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === "/:path*");

    expect(globalRule?.headers).not.toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  });

  it("enables HSTS for the public HTTPS frontend", async () => {
    vi.stubEnv("LUMENZA_TLS_TERMINATED", "true");
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === "/:path*");

    expect(globalRule?.headers).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  });
});
