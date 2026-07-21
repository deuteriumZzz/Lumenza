import { NextResponse, type NextRequest } from "next/server";

const API_ORIGIN = process.env.LUMENZA_API_ORIGIN ?? "http://localhost:8000";

export const config = {
  matcher: ["/api/:path*", "/media/:path*"],
};

// Прокси на тот же origin к Django API в разработке, чтобы браузеру
// никогда не понадобился CORS: API-запросы и медиа с клиента попадают на
// этот сервер Next.js, который прозрачно переписывает их в Django.
//
// Next.js убирает завершающий слэш во входящих путях запроса ещё до того,
// как это вообще выполняется (верно и для `rewrites()` в next.config.ts —
// который заново собирает захваченные сегменты `:path*` без него, — и для
// `request.nextUrl.pathname`, читаемого здесь напрямую). Каждый API-роут
// Lumenza определён с завершающим слэшем (конвенция APPEND_SLASH в
// Django), а APPEND_SLASH отдаёт 500 на POST без слэша, поскольку не может
// сделать редирект, сохранив тело запроса. Поскольку конвенция бэкенда
// фиксирована и известна, безусловно добавляем слэш заново при
// проксировании, а не полагаемся на то, что Next.js его сохранит.
export function proxy(request: NextRequest) {
  const requestPath = request.nextUrl.pathname;
  const isApiPath = requestPath === "/api" || requestPath.startsWith("/api/");
  const pathname = isApiPath && !requestPath.endsWith("/")
    ? `${requestPath}/`
    : requestPath;
  const target = new URL(pathname + request.nextUrl.search, API_ORIGIN);
  return NextResponse.rewrite(target);
}
