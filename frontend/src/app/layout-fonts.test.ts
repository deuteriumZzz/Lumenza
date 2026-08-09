// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const layoutSource = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");

describe("root font contract", () => {
  it("loads matching Cyrillic and Latin Geist subsets for Russian UI", () => {
    expect(layoutSource.match(/subsets:\s*\["cyrillic",\s*"latin"\]/g)).toHaveLength(2);
  });

  it("keeps Geist Sans global and Geist Mono scoped through its variable", () => {
    expect(layoutSource).toContain("geistSans.variable");
    expect(layoutSource).toContain("geistMono.variable");
    expect(layoutSource).not.toMatch(/<body[^>]*font-mono/);
  });
});
