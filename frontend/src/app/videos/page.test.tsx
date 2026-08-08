import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  videos: vi.fn(),
  createVideo: vi.fn(),
  createVideoAnimation: vi.fn(),
  refreshBalance: vi.fn(),
  query: "",
  replace: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
  usePathname: () => "/studio",
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ refreshBalance: mocks.refreshBalance }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      videos: mocks.videos,
      createVideo: mocks.createVideo,
      createVideoAnimation: mocks.createVideoAnimation,
    },
  };
});

import { Videos } from "@/app/videos/page";

describe("Videos workspace", () => {
  beforeEach(() => {
    mocks.videos.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });
    mocks.createVideo.mockResolvedValue({
      id: 3,
      prompt: "a fox running through a forest",
      provider: "replicate",
      model: "wan-2.5-t2v-fast",
      status: "pending",
      credits_charged: "1.0000",
      mocked: true,
      video_url: null,
      source_image_url: null,
      created_at: "2026-08-02T00:00:00Z",
      completed_at: null,
    });
  });

  afterEach(() => {
    cleanup();
    mocks.videos.mockReset();
    mocks.refreshBalance.mockReset();
    mocks.createVideo.mockReset();
    mocks.createVideoAnimation.mockReset();
    mocks.query = "";
    mocks.replace.mockReset();
    mocks.push.mockReset();
  });

  it("submits a text-to-video prompt in the default submode", async () => {
    render(<Videos />);
    await waitFor(() => expect(mocks.videos).toHaveBeenCalled());

    expect(screen.getByTestId("videos-content").className).toContain("studio-content");
    const composer = screen.getByRole("form", { name: "Video prompt composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Промпт Video" }), {
      target: { value: "a fox running through a forest" },
    });
    fireEvent.click(within(composer).getByRole("button", { name: "Создать" }));

    await waitFor(() =>
      expect(mocks.createVideo).toHaveBeenCalledWith("a fox running through a forest"),
    );
  });

  it("requires a starting frame before submitting in Starting frame submode", async () => {
    mocks.createVideoAnimation.mockResolvedValue({
      id: 4,
      prompt: "make it drift",
      provider: "replicate",
      model: "wan-2.5-i2v-fast",
      status: "pending",
      credits_charged: "1.0000",
      mocked: true,
      video_url: null,
      source_image_url: "http://example.test/frame.png",
      created_at: "2026-08-02T00:00:00Z",
      completed_at: null,
    });

    render(<Videos />);
    await waitFor(() => expect(mocks.videos).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Starting frame" }));
    const composer = screen.getByRole("form", { name: "Video prompt composer" });
    fireEvent.change(within(composer).getByRole("textbox", { name: "Промпт Video" }), {
      target: { value: "make it drift" },
    });

    expect(within(composer).getByRole("button", { name: "Создать" })).toHaveProperty("disabled", true);

    const file = new File(["frame"], "frame.png", { type: "image/png" });
    const input = screen.getByLabelText("Стартовый кадр") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    expect(within(composer).getByRole("button", { name: "Создать" })).toHaveProperty("disabled", false);
    fireEvent.click(within(composer).getByRole("button", { name: "Создать" }));

    await waitFor(() =>
      expect(mocks.createVideoAnimation).toHaveBeenCalledWith("make it drift", file),
    );
  });
});
