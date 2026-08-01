import type { NextRequest } from "next/server";
import {
  buildBackendUrl,
  createClientResponseHeaders,
  createUpstreamRequestHeaders,
  getClientResponseStatus,
  shouldStreamBackendRequest,
  shouldStreamBackendResponse,
  withLocalPreviewAuthorization,
} from "@/lib/backend-route-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };
type StreamingRequestInit = RequestInit & { duplex?: "half" };

async function forward(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  const requestUrl = new URL(request.url);
  const backendOrigin = process.env.LUMENZA_API_ORIGIN ?? "http://localhost:8000";
  const target = buildBackendUrl(path, requestUrl.search, backendOrigin);
  const forwardedProtoHeader = request.headers.get("x-forwarded-proto");
  const forwardedProto = forwardedProtoHeader === "https" ? "https" : "http";
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== null;
  const requestHost = (request.headers.get("host") ?? requestUrl.host).toLowerCase();
  const exposeLocalPreviewToken =
    process.env.LUMENZA_ALLOW_HTTP_LOCALHOST === "true"
    && requestUrl.protocol === "http:"
    && /^(localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/.test(requestHost);
  const headers = withLocalPreviewAuthorization(
    createUpstreamRequestHeaders(
      request.headers,
      request.headers.get("host") ?? requestUrl.host,
      forwardedProto,
    ),
    exposeLocalPreviewToken,
  );
  const init: StreamingRequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    signal: request.signal,
  };
  if (hasBody) {
    if (shouldStreamBackendRequest(request.headers.get("content-type"))) {
      init.body = request.body;
      init.duplex = "half";
    } else {
      init.body = await request.arrayBuffer();
    }
  }

  try {
    const upstream = await fetch(target, init);
    const noBody = request.method === "HEAD" || [204, 205, 304].includes(upstream.status);
    const streamingResponse = shouldStreamBackendResponse(upstream.headers.get("content-type"));
    const responseBody = noBody || upstream.body === null
      ? null
      : streamingResponse
        ? upstream.body
        : await upstream.arrayBuffer();
    const clientHeaders = createClientResponseHeaders(upstream.headers, {
      exposeAuthToken: exposeLocalPreviewToken,
    });
    const clientStatus = getClientResponseStatus(
      upstream.status,
      exposeLocalPreviewToken,
      streamingResponse,
    );
    if (clientStatus !== upstream.status) {
      clientHeaders.set("x-lumenza-preview-status", String(upstream.status));
      clientHeaders.set("cache-control", "no-store");
    }
    return new Response(responseBody, {
      status: clientStatus,
      statusText: clientStatus === upstream.status ? upstream.statusText : "Local Preview Transport",
      headers: clientHeaders,
    });
  } catch {
    return Response.json(
      { success: false, error: "Backend unavailable" },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const OPTIONS = forward;
