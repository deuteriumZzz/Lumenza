import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Next.js development indicator", () => {
  it("does not cover profile controls in the development UI", () => {
    expect(nextConfig.devIndicators).toBe(false);
  });
});
