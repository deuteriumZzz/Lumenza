import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResponseSkeleton } from "@/components/response-skeleton";

describe("ResponseSkeleton", () => {
  afterEach(cleanup);

  it("announces generation without exposing decorative shimmer lines", () => {
    const { container } = render(<ResponseSkeleton />);

    expect(screen.getByRole("status").textContent).toContain("Generating response");
    const visual = container.querySelector('[aria-hidden="true"]');
    expect(visual).not.toBeNull();
    expect(visual?.querySelectorAll("span")).toHaveLength(3);
  });
});
