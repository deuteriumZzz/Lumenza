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
      expect.objectContaining({ credentials: "omit" }),
    );
  });
});

describe("pet API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.cookie = "csrftoken=; Max-Age=0; Path=/";
  });

  it("uploads a pet with multipart PATCH and lets the browser set its boundary", async () => {
    document.cookie = "csrftoken=abcdefghijklmnopqrstuvwxyz123456; Path=/";
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({
        id: 1,
        username: "alice",
        email: "alice@example.com",
        telegram_linked: false,
        tier: "free",
        pet_name: "Люми",
        pet_image: "/media/pets/lumi.webp",
        show_pet: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["pet"], "lumi.webp", { type: "image/webp" });

    await api.updatePet({ name: "Люми", image: file, show: true });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me/pet/",
      expect.objectContaining({ method: "PATCH", body: expect.any(FormData) }),
    );
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = options.headers as Headers;
    expect(headers.get("Content-Type")).toBeNull();
    expect(headers.get("X-CSRFToken")).toBe("abcdefghijklmnopqrstuvwxyz123456");
    const body = options.body as FormData;
    expect(body.get("pet_name")).toBe("Люми");
    expect(body.get("show_pet")).toBe("true");
    expect(body.get("pet_image")).toMatchObject({ name: "lumi.webp", type: "image/webp" });
  });

  it("removes the pet through the dedicated endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers(),
      json: vi.fn().mockResolvedValue({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await api.removePet();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me/pet/",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
