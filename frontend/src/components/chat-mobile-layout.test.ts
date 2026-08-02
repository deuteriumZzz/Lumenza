import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("Chat mobile composer layout", () => {
  it("switches the crowded control row to compact icon controls", () => {
    const component = fs.readFileSync(
      path.join(process.cwd(), "src/components/chat-thread-view.tsx"),
      "utf8",
    );
    const stylesheet = fs.readFileSync(
      path.join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(component).toContain('className="chat-composer-controls flex min-w-0 items-center gap-2"');
    expect(component).toContain('className="chat-composer-actions ml-auto flex items-center gap-1.5"');
    expect(stylesheet).toMatch(
      /@media \(max-width: 479px\)[\s\S]*\.chat-composer-controls \.model-picker-trigger > span[\s\S]*display: none;/,
    );
  });
});
