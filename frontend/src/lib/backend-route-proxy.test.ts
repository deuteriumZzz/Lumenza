import { describe, expect, it } from "vitest";
import {
  buildBackendUrl,
  createUpstreamRequestHeaders,
  createClientResponseHeaders,
  getClientResponseStatus,
  withLocalPreviewAuthorization,
  shouldStreamBackendResponse,
  shouldStreamBackendRequest,
} from "@/lib/backend-route-proxy";

describe("backend route proxy", () => {
  it("builds a fixed-origin Django URL and restores the API slash", () => {
    expect(
      buildBackendUrl(
        ["auth", "login"],
        "?next=%2Fhome",
        "http://127.0.0.1:8000",
      ).toString(),
    ).toBe("http://127.0.0.1:8000/api/auth/login/?next=%2Fhome");
  });

  it("does not forward browser hop-by-hop or spoofed forwarding headers", () => {
    const headers = createUpstreamRequestHeaders(
      new Headers({
        connection: "keep-alive",
        host: "attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "http",
        cookie: "session=allowed",
      }),
      "127.0.0.1:3000",
      "http",
    );

    expect(headers.get("connection")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("cookie")).toBe("session=allowed");
    expect(headers.get("x-forwarded-host")).toBe("127.0.0.1:3000");
    expect(headers.get("x-forwarded-proto")).toBe("http");
  });

  it("keeps the httpOnly auth cookie and exposes the readable CSRF token separately", () => {
    const upstream = new Headers({
      connection: "keep-alive",
      "keep-alive": "timeout=5",
      "content-type": "application/json",
    });
    upstream.append("set-cookie", "lumenza_token=0123456789abcdef0123456789abcdef01234567; HttpOnly; Path=/");
    upstream.append("set-cookie", "csrftoken=abcdefghijklmnopqrstuvwxyzABCDEF; Path=/");

    const headers = createClientResponseHeaders(upstream, { exposeAuthToken: true });

    expect(headers.get("connection")).toBeNull();
    expect(headers.get("keep-alive")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.getSetCookie()).toEqual([]);
    expect(headers.get("x-lumenza-preview-token")).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(headers.get("x-lumenza-csrf-token")).toBe("abcdefghijklmnopqrstuvwxyzABCDEF");
  });

  it("preserves the httpOnly auth cookie outside local preview", () => {
    const upstream = new Headers();
    upstream.append("set-cookie", "lumenza_token=one; HttpOnly; Path=/");

    const headers = createClientResponseHeaders(upstream);

    expect(headers.getSetCookie()).toEqual(["lumenza_token=one; HttpOnly; Path=/"]);
    expect(headers.get("x-lumenza-preview-token")).toBeNull();
  });

  it("buffers finite API payloads but preserves event streams", () => {
    expect(shouldStreamBackendResponse("application/json")).toBe(false);
    expect(shouldStreamBackendResponse("text/event-stream; charset=utf-8")).toBe(true);
  });

  it("buffers JSON requests but streams large multipart uploads", () => {
    expect(shouldStreamBackendRequest("application/json")).toBe(false);
    expect(shouldStreamBackendRequest("multipart/form-data; boundary=upload")).toBe(true);
  });

  it("tunnels successful finite responses only for the explicit local preview", () => {
    expect(getClientResponseStatus(200, true, false)).toBe(418);
    expect(getClientResponseStatus(204, true, false)).toBe(418);
    expect(getClientResponseStatus(200, false, false)).toBe(200);
    expect(getClientResponseStatus(200, true, true)).toBe(200);
    expect(getClientResponseStatus(401, true, false)).toBe(401);
  });

  it("translates the local preview header without forwarding it upstream", () => {
    const source = new Headers({
      "x-lumenza-preview-token": "0123456789abcdef0123456789abcdef01234567",
    });
    const localHeaders = withLocalPreviewAuthorization(source, true);
    const productionHeaders = withLocalPreviewAuthorization(source, false);

    expect(localHeaders.get("authorization")).toBe(
      "Token 0123456789abcdef0123456789abcdef01234567",
    );
    expect(localHeaders.get("x-lumenza-preview-token")).toBeNull();
    expect(productionHeaders.get("authorization")).toBeNull();
    expect(productionHeaders.get("x-lumenza-preview-token")).toBeNull();
    expect(source.get("x-lumenza-preview-token")).not.toBeNull();
  });
});
