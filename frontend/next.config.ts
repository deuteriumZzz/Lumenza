import type { NextConfig } from "next";

// Проксирование /ws/* через rewrites() здесь не работает: у next start
// (продакшн-сервер) handleUpgrade() — заглушка ("the web server does not
// support web sockets, it's only used for HMR in development", см.
// node_modules/next/dist/server/next-server.js). Подтверждено и вживую:
// curl-запрос с Upgrade-заголовком на /ws/voice/ зависает без ответа.
// Поэтому голосовой WS-клиент (frontend/src/app/voice/page.tsx) ходит на
// backend-origin напрямую, а не через этот сервер — см. NEXT_PUBLIC_WS_ORIGIN.
const nextConfig: NextConfig = {
  // The desktop preview is intentionally opened through 127.0.0.1 while
  // Next's dev server advertises localhost. Without this narrow allowance
  // the browser receives HTML but blocks the client bundle, so a login form
  // falls back to a plain GET submission before React can intercept it.
  allowedDevOrigins: process.env.LUMENZA_ALLOW_HTTP_LOCALHOST === "true"
    ? ["127.0.0.1"]
    : [],
  // Django deliberately exposes slash-terminated API routes. Let proxy.ts
  // preserve that contract instead of making every unsafe request cross a
  // framework-level 308 before it can reach the backend.
  skipTrailingSlashRedirect: true,
  // The workspace profile lives in the bottom-left corner. Keep Next.js'
  // development-only indicator from covering it. Runtime and build errors
  // still surface through the regular Next.js error overlay.
  devIndicators: false,
  async headers() {
    const transportHeaders = process.env.LUMENZA_TLS_TERMINATED === "true"
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
        ]
      : [];
    return [
      {
        source: "/:path*",
        headers: [
          ...transportHeaders,
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
