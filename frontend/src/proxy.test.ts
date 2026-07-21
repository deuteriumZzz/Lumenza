import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "@/proxy";

describe("frontend proxy", () => {
  it("routes media files through the backend without changing their path", () => {
    expect(config.matcher).toContain("/media/:path*");

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
});
