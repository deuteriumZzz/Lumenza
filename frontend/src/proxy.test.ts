import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
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

  it("keeps the backend's trailing-slash convention for API routes", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/api/images?page=2"),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost:8000/api/images/?page=2",
    );

    const apiRootResponse = proxy(
      new NextRequest("http://localhost:3000/api"),
    );
    expect(apiRootResponse.headers.get("x-middleware-rewrite")).toBe(
      "http://localhost:8000/api/",
    );
  });

  it("forwards the public HTTPS protocol to Django explicitly", () => {
    const response = proxy(
      new NextRequest("https://public.example/api/auth/me", {
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
