import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";

describe("local preview authentication transport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    sessionStorage.clear();
  });

  it("stores local preview headers from a successful buffered response", async () => {
    const responseHeaders = new Headers({
      "x-lumenza-csrf-token": "abcdefghijklmnopqrstuvwxyzABCDEF",
      "x-lumenza-preview-token": "0123456789abcdef0123456789abcdef01234567",
      "x-lumenza-preview-status": "200",
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 418,
      headers: responseHeaders,
      json: vi.fn().mockResolvedValue({
        id: 1,
        username: "lumenza_test",
        email: "lumenza@example.local",
        telegram_linked: false,
        tier: "paid",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.login("lumenza_test", "secret")).resolves.toMatchObject({
      username: "lumenza_test",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login/",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ username: "lumenza_test", password: "secret" }),
        credentials: "omit",
      }),
    );
    expect(document.cookie).toContain("csrftoken=abcdefghijklmnopqrstuvwxyzABCDEF");
    expect(sessionStorage.getItem("lumenza_preview_token")).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );

    await api.balance();
    const previewRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(previewRequest.headers).get("authorization")).toBeNull();
    expect(new Headers(previewRequest.headers).get("x-lumenza-preview-token")).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
  });
});
