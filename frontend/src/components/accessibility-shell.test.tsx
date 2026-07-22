import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import Home from "@/app/page";
import { AccessibilityShell } from "@/components/accessibility-shell";

describe("AccessibilityShell", () => {
  afterEach(cleanup);

  it("provides a keyboard skip link to a focusable main landmark", () => {
    render(
      <AccessibilityShell navigation={<nav aria-label="Primary navigation">Navigation</nav>}>
        <h1>Workspace</h1>
      </AccessibilityShell>,
    );

    const skipLink = screen.getByRole("link", { name: "Перейти к основному содержимому" });
    expect(skipLink.getAttribute("href")).toBe("#main-content");
    expect(
      skipLink.compareDocumentPosition(screen.getByRole("navigation")) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const main = screen.getByRole("main");
    expect(main.id).toBe("main-content");
    expect(main.getAttribute("tabindex")).toBe("-1");
  });

  it("keeps exactly one main landmark on the public home page", () => {
    render(
      <AccessibilityShell>
        <Home />
      </AccessibilityShell>,
    );

    expect(screen.getAllByRole("main")).toHaveLength(1);
  });
});
