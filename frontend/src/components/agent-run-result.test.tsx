import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentRunResult } from "@/components/agent-run-result";
import type { ThreadsContentPlan } from "@/lib/api";

const PLAN: ThreadsContentPlan = {
  branches: [{ title: "Запуск", angle: "почему сейчас" }],
  hooks: [{ branch: "Запуск", variants: ["Мы это сделали.", "Готовы?"] }],
  schedule: [
    { time: "09:00", branch: "Запуск", post_text: "Сегодня мы запускаемся." },
  ],
  variants: ["Короче: мы запустились."],
};

describe("AgentRunResult", () => {
  afterEach(cleanup);

  it("renders branches, hooks, schedule, and variants", () => {
    render(<AgentRunResult plan={PLAN} />);

    // "Запуск" is the branch title reused as the hook/schedule key — appears
    // in all three sections, which is the realistic shape the workflow
    // produces (hooks/schedule reference branches by their title).
    expect(screen.getAllByText("Запуск")).toHaveLength(3);
    expect(screen.getByText("почему сейчас")).toBeDefined();
    expect(screen.getByText("Мы это сделали.")).toBeDefined();
    expect(screen.getByText("Готовы?")).toBeDefined();
    expect(screen.getByText("09:00")).toBeDefined();
    expect(screen.getByText("Сегодня мы запускаемся.")).toBeDefined();
    expect(screen.getByText("Короче: мы запустились.")).toBeDefined();
  });
});
