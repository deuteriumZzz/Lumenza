import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Next.js development indicator", () => {
  it("does not cover profile controls in the development UI", () => {
    expect(nextConfig.devIndicators).toBe(false);
  });

  it("enables HSTS for the public HTTPS frontend", async () => {
    const rules = await nextConfig.headers?.();
    const globalRule = rules?.find((rule) => rule.source === "/:path*");

    expect(globalRule?.headers).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  });
});
