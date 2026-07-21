import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";

describe("history API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serializes pagination and active filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        count: 0,
        next: null,
        previous: null,
        results: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.history(2, {
      task: "repurpose",
      provider: "openai",
      status: "ok",
      created_after: "2026-07-19T16:00:00.000Z",
      created_before: "2026-07-20T16:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/history/?page=2&task=repurpose&provider=openai&status=ok&created_after=2026-07-19T16%3A00%3A00.000Z&created_before=2026-07-20T16%3A00%3A00.000Z",
      expect.objectContaining({ credentials: "include" }),
    );
  });
});
