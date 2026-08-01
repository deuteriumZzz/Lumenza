const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function buildBackendUrl(
  pathSegments: readonly string[],
  search: string,
  backendOrigin: string,
): URL {
  const safePath = pathSegments.map((segment) => encodeURIComponent(segment)).join("/");
  return new URL(`/api/${safePath}/${search}`, backendOrigin);
}

export function createUpstreamRequestHeaders(
  source: Headers,
  forwardedHost: string,
  forwardedProto: "http" | "https",
): Headers {
  const headers = new Headers(source);
  for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
  headers.delete("host");
  headers.delete("x-forwarded-for");
  headers.set("accept-encoding", "identity");
  headers.set("x-forwarded-host", forwardedHost);
  headers.set("x-forwarded-proto", forwardedProto);
  return headers;
}

export function createClientResponseHeaders(
  source: Headers,
  options: { exposeAuthToken?: boolean } = {},
): Headers {
  const headers = new Headers();
  for (const [name, value] of source.entries()) {
    if (name.toLowerCase() !== "set-cookie" && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      headers.append(name, value);
    }
  }
  for (const cookie of source.getSetCookie()) {
    const csrfMatch = /^csrftoken=([^;]+)/i.exec(cookie);
    if (csrfMatch) {
      if (/^[A-Za-z0-9]{32,64}$/.test(csrfMatch[1])) {
        headers.set("x-lumenza-csrf-token", csrfMatch[1]);
      }
      continue;
    }
    const authMatch = /^lumenza_token=([^;]+)/i.exec(cookie);
    if (authMatch && options.exposeAuthToken) {
      if (/^[A-Za-z0-9]{20,128}$/.test(authMatch[1])) {
        headers.set("x-lumenza-preview-token", authMatch[1]);
        headers.set("cache-control", "no-store");
      }
      continue;
    }
    headers.append("set-cookie", cookie);
  }
  return headers;
}

export function shouldStreamBackendResponse(contentType: string | null): boolean {
  return contentType?.toLowerCase().startsWith("text/event-stream") ?? false;
}

export function shouldStreamBackendRequest(contentType: string | null): boolean {
  return contentType?.toLowerCase().startsWith("multipart/form-data") ?? false;
}

export function getClientResponseStatus(
  upstreamStatus: number,
  localPreview: boolean,
  streaming: boolean,
): number {
  return localPreview && !streaming && upstreamStatus >= 200 && upstreamStatus < 300
    ? 418
    : upstreamStatus;
}

export function withLocalPreviewAuthorization(source: Headers, enabled: boolean): Headers {
  const headers = new Headers(source);
  const token = headers.get("x-lumenza-preview-token");
  headers.delete("x-lumenza-preview-token");
  if (enabled && token && /^[A-Za-z0-9]{20,128}$/.test(token)) {
    headers.set("authorization", `Token ${token}`);
  }
  return headers;
}
