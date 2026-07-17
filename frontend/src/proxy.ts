import { NextResponse, type NextRequest } from "next/server";

const API_ORIGIN = process.env.LUMENZA_API_ORIGIN ?? "http://localhost:8000";

export const config = {
  matcher: "/api/:path*",
};

// Same-origin proxy to the Django API in dev, so the browser never needs
// CORS: fetch("/api/...") from the client hits this Next.js server, which
// rewrites to Django transparently.
//
// Next.js normalizes away trailing slashes on incoming request paths before
// this ever runs (true both for next.config.ts's `rewrites()` — which
// rejoins the captured `:path*` segments without one — and for
// `request.nextUrl.pathname` read here directly). Every Lumenza API route
// is defined with a trailing slash (Django's APPEND_SLASH convention), and
// APPEND_SLASH 500s on a slash-less POST because it can't redirect while
// preserving the request body. Since the backend's convention is fixed and
// known, re-append the slash unconditionally when forwarding rather than
// depending on Next.js to preserve it.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.endsWith("/")
    ? request.nextUrl.pathname
    : `${request.nextUrl.pathname}/`;
  const target = new URL(pathname + request.nextUrl.search, API_ORIGIN);
  return NextResponse.rewrite(target);
}
