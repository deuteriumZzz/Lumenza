import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AboutPage from "@/app/about/page";

describe("AboutPage", () => {
  afterEach(cleanup);

  it("explains that web and Telegram share one account", () => {
    render(<AboutPage />);

    expect(
      screen.getByRole("heading", {
        name: /Одна рабочая среда для разных моделей и форматов/,
      }),
    ).toBeDefined();
    expect(screen.getByText(/синхронизированы между web и Telegram/)).toBeDefined();
    expect(screen.getByRole("link", { name: "Открыть чат" }).getAttribute("href"))
      .toBe("/chat");
    expect(screen.getByRole("link", { name: "Перейти в Студию" }).getAttribute("href"))
      .toBe("/studio");
  });
});
