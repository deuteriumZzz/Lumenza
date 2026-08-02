import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("local preview login route", () => {
  const originalPreviewFlag = process.env.LUMENZA_ALLOW_HTTP_LOCALHOST;

  afterEach(() => {
    process.env.LUMENZA_ALLOW_HTTP_LOCALHOST = originalPreviewFlag;
    vi.unstubAllGlobals();
  });

  it("uses a top-level POST and installs only the validated preview token", async () => {
    process.env.LUMENZA_ALLOW_HTTP_LOCALHOST = "true";
    const backendToken = "0123456789abcdef0123456789abcdef01234567";
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 1, username: "lumenza_test" }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": `lumenza_token=${backendToken}; Path=/; HttpOnly; SameSite=Lax`,
        },
      },
    ));
    vi.stubGlobal("fetch", fetchMock);
    // Строка, а не сам объект URLSearchParams: конструктор Request под
    // vitest environment=jsdom видит другой класс URLSearchParams (из
    // jsdom), чем нативный Node/undici Request ожидает через instanceof —
    // передача уже сериализованной строки с тем же content-type обходит
    // это несовпадение между реалмами, сам route.ts всё равно парсит тело
    // через FormData одинаково для обоих представлений.
    const body = new URLSearchParams({
      username: "lumenza_test",
      password: "local-test-password",
    }).toString();

    const response = await POST(new Request("http://127.0.0.1:3000/auth/preview-login", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3000",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("set-cookie")).toBeNull();
    const html = await response.text();
    expect(html).toContain(backendToken);
    expect(html).toContain("sessionStorage.setItem");
    expect(html).toContain("location.replace(\"/home\")");
    expect(html).not.toContain("local-test-password");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/auth\/login\/$/),
      expect.objectContaining({ method: "POST", redirect: "manual" }),
    );
  });

  it("is unavailable when the explicitly local preview flag is disabled", async () => {
    process.env.LUMENZA_ALLOW_HTTP_LOCALHOST = "false";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://127.0.0.1:3000/auth/preview-login", {
      method: "POST",
      headers: { host: "127.0.0.1:3000" },
      body: new URLSearchParams({ username: "test", password: "secret" }).toString(),
    }));

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
