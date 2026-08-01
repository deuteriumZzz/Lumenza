import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { config, proxy } from "@/proxy";

describe("frontend proxy", () => {
  it("routes media files through the backend without changing their path", () => {
    expect(config.matcher).toContain("/:path*");

    const response = proxy(
      new NextRequest(
        "http://localhost:3000/media/generated/result.webp?download=1",
      ),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost:8000/media/generated/result.webp?download=1",
    );
  });

  it("hands API routes to the same-origin Next.js route handler", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/api/images?page=2"),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("forwards the public HTTPS protocol on rewritten media requests", () => {
    const response = proxy(
      new NextRequest("https://public.example/media/generated/result.webp", {
        headers: { "x-forwarded-proto": "https" },
      }),
    );

    expect(
      response.headers.get("x-middleware-request-x-forwarded-proto"),
    ).toBe("https");
  });

  it("redirects every HTTP page to the same HTTPS URL", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/studio?mode=images", {
        headers: {
          host: "localhost:3000",
          "x-forwarded-proto": "http",
        },
      }),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe(
      "https://localhost:3000/studio?mode=images",
    );
  });

  it("allows an explicitly enabled localhost HTTP preview", () => {
    vi.stubEnv("LUMENZA_ALLOW_HTTP_LOCALHOST", "true");

    const response = proxy(
      new NextRequest("http://localhost:3000/studio?mode=image", {
        headers: {
          host: "localhost:3000",
          "x-forwarded-proto": "http",
        },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    vi.unstubAllEnvs();
  });

  it("rejects an unsafe forwarded host instead of redirecting to it", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/studio", {
        headers: {
          host: "public.example@attacker.example",
          "x-forwarded-proto": "http",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects a syntactically valid host that is not allowlisted", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/studio", {
        headers: {
          host: "attacker.example",
          "x-forwarded-proto": "http",
        },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("leaves regular HTTPS pages to Next.js", () => {
    const response = proxy(
      new NextRequest("https://public.example/studio", {
        headers: { "x-forwarded-proto": "https" },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
