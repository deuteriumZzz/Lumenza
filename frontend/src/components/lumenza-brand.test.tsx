import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  LumenzaBrand,
  LumenzaConvergence,
  LumenzaMark,
} from "@/components/lumenza-brand";

describe("Lumenza brand system", () => {
  afterEach(cleanup);

  it("uses a consistent aggregator mark and an accessible wordmark", () => {
    render(<LumenzaBrand href="/chat" />);

    expect(
      screen
        .getByRole("link", { name: "Lumenza — AI-агрегатор" })
        .getAttribute("href"),
    ).toBe("/chat");
    expect(screen.getByTestId("lumenza-mark")).toBeDefined();
    expect(screen.getAllByTestId("lumenza-source-node")).toHaveLength(3);
  });

  it("can render the compact mark without exposing decorative geometry", () => {
    render(<LumenzaMark />);

    expect(screen.getByTestId("lumenza-mark").getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("explains the animated convergence metaphor in the empty chat", () => {
    render(<LumenzaConvergence />);

    expect(
      screen.getByRole("img", {
        name: "Lumenza объединяет несколько AI-моделей в один ответ",
      }),
    ).toBeDefined();
    expect(screen.getByText("Модели сходятся здесь")).toBeDefined();
  });
});
