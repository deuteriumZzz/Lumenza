import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioMark } from "@/components/studio-mark";

describe("StudioMark", () => {
  afterEach(cleanup);

  it("renders a compact four-tool aperture around one creative core", () => {
    render(<StudioMark />);

    const mark = screen.getByTestId("studio-mark");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByTestId("studio-mark-petal")).toHaveLength(4);
    expect(screen.getByTestId("studio-mark-core")).toBeDefined();
  });

  it("exposes active state to the visual treatment without changing semantics", () => {
    render(<StudioMark active className="size-8" />);

    const mark = screen.getByTestId("studio-mark");
    expect(mark.getAttribute("data-active")).toBe("true");
    expect(mark.getAttribute("class")).toContain("size-8");
    expect(screen.queryByRole("img")).toBeNull();
  });
});
