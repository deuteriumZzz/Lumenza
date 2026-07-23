import type { NextConfig } from "next";

// Проксирование /ws/* через rewrites() здесь не работает: у next start
// (продакшн-сервер) handleUpgrade() — заглушка ("the web server does not
// support web sockets, it's only used for HMR in development", см.
// node_modules/next/dist/server/next-server.js). Подтверждено и вживую:
// curl-запрос с Upgrade-заголовком на /ws/voice/ зависает без ответа.
// Поэтому голосовой WS-клиент (frontend/src/app/voice/page.tsx) ходит на
// backend-origin напрямую, а не через этот сервер — см. NEXT_PUBLIC_WS_ORIGIN.
const nextConfig: NextConfig = {};

export default nextConfig;
