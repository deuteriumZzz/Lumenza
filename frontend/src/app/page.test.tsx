import type { AnchorHTMLAttributes, ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
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

vi.mock("@/components/telegram-cta", () => ({
  TelegramCta: () => <a href="https://t.me/lumenza">Telegram</a>,
}));

import Home from "@/app/page";

describe("Home", () => {
  afterEach(cleanup);

  it("positions Lumenza as a broad AI aggregator", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /ведущие AI-модели/i,
      }),
    ).toBeDefined();
    expect(screen.queryByText(/AI-задач вашего контента/i)).toBeNull();
  });

  it("presents general capabilities and keeps marketing as one category", () => {
    render(<Home />);

    const capabilities = screen.getByRole("region", {
      name: "Возможности Lumenza",
    });
    expect(within(capabilities).getByText("Исследования и знания")).toBeDefined();
    expect(within(capabilities).getByText("Творческая студия")).toBeDefined();
    expect(within(capabilities).getByText("Работа и бизнес")).toBeDefined();
    expect(within(capabilities).getByText(/Маркетинг и контент/)).toBeDefined();
  });
});
