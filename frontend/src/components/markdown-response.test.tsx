import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownResponse } from "@/components/markdown-response";

describe("MarkdownResponse", () => {
  afterEach(cleanup);

  it("renders common Markdown and GitHub-flavored tables", () => {
    render(
      <MarkdownResponse
        content={[
          "## Plan",
          "",
          "- **Draft** the hook",
          "- Publish the post",
          "",
          "| Channel | Status |",
          "| --- | --- |",
          "| Blog | Ready |",
        ].join("\n")}
      />,
    );

    expect(screen.getByRole("heading", { name: "Plan", level: 2 })).toBeDefined();
    expect(screen.getByRole("list")).toBeDefined();
    expect(screen.getByText("Draft").tagName).toBe("STRONG");
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Channel" })).toBeDefined();
    expect(within(table).getByRole("cell", { name: "Ready" })).toBeDefined();
  });

  it("renders code and opens safe external links without giving them opener access", () => {
    render(
      <MarkdownResponse content={'Use `npm test` and read [the guide](https://example.com/docs).'} />,
    );

    expect(screen.getByText("npm test").tagName).toBe("CODE");
    const link = screen.getByRole("link", { name: "the guide" });
    expect(link.getAttribute("href")).toBe("https://example.com/docs");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("preserves ordinary soft line breaks from plain assistant responses", () => {
    render(<MarkdownResponse content={"Line one\nLine two"} />);

    const paragraph = screen.getByText((_, element) =>
      element?.tagName === "P" && element.textContent === "Line one\nLine two"
    );
    expect(paragraph.className).toContain("whitespace-pre-wrap");
  });

  it("does not execute raw HTML or unsafe URL protocols", () => {
    const { container } = render(
      <MarkdownResponse
        content={[
          '<script>alert("xss")</script>',
          '[unsafe](javascript:alert("xss"))',
          '![tracking pixel](https://example.com/pixel.png)',
        ].join("\n")}
      />,
    );

    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    const unsafeLink = screen.getByText("unsafe").closest("a");
    expect(unsafeLink?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
  });
});
