export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)(?::[0-9]{1,5})?$/;
const SAFE_TOKEN = /^[A-Za-z0-9]{20,128}$/;

function isEnabledLocalRequest(request: Request): boolean {
  const url = new URL(request.url);
  const host = (request.headers.get("host") ?? url.host).toLowerCase();
  return process.env.LUMENZA_ALLOW_HTTP_LOCALHOST === "true"
    && url.protocol === "http:"
    && LOCAL_HOST.test(host);
}

function cookieValue(headers: Headers, name: string): string | null {
  const values = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [headers.get("set-cookie") ?? ""];
  const pattern = new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`, "i");
  for (const value of values) {
    const match = pattern.exec(value);
    if (match) return match[1];
  }
  return null;
}

function htmlResponse(body: string, status = 200, nonce?: string): Response {
  const headers = new Headers({
    "cache-control": "no-store",
    "content-type": "text/html; charset=utf-8",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (nonce) {
    headers.set(
      "content-security-policy",
      `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`,
    );
  }
  return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8">${body}</html>`, {
    status,
    headers,
  });
}

function errorPage(message: string, status: number): Response {
  return htmlResponse(
    `<title>Вход — Lumenza</title><body style="margin:0;background:#08090c;color:#f5f6f8;font:16px system-ui;display:grid;place-items:center;min-height:100vh"><main style="max-width:420px;padding:32px;text-align:center"><h1 style="font-size:24px">Не удалось войти</h1><p style="color:#a9acb5">${message}</p><a href="/login" style="color:#b79cff">Вернуться ко входу</a></main></body>`,
    status,
  );
}

export async function POST(request: Request): Promise<Response> {
  if (!isEnabledLocalRequest(request)) {
    return new Response(null, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorPage("Некорректные данные формы.", 400);
  }
  const username = form.get("username");
  const password = form.get("password");
  if (
    typeof username !== "string"
    || typeof password !== "string"
    || username.length < 1
    || username.length > 150
    || password.length < 1
    || password.length > 256
  ) {
    return errorPage("Проверьте имя пользователя и пароль.", 400);
  }

  const backendOrigin = process.env.LUMENZA_API_ORIGIN ?? "http://localhost:8000";
  let upstream: Response;
  try {
    upstream = await fetch(new URL("/api/auth/login/", backendOrigin).toString(), {
      method: "POST",
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        "content-type": "application/json",
        "x-forwarded-host": request.headers.get("host") ?? "127.0.0.1:3000",
        "x-forwarded-proto": "http",
      },
      body: JSON.stringify({ username, password }),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return errorPage("Сервер авторизации временно недоступен.", 502);
  }

  if (!upstream.ok) {
    return errorPage(
      upstream.status === 401 ? "Неверные логин или пароль." : "Сервер отклонил запрос.",
      upstream.status === 401 ? 401 : 502,
    );
  }

  const token = cookieValue(upstream.headers, "lumenza_token");
  if (!token || !SAFE_TOKEN.test(token)) {
    return errorPage("Сервер не создал локальную тестовую сессию.", 502);
  }

  const nonce = crypto.randomUUID().replaceAll("-", "");
  const tokenLiteral = JSON.stringify(token).replaceAll("<", "\\u003c");
  return htmlResponse(
    `<title>Вход — Lumenza</title><body style="margin:0;background:#08090c;color:#f5f6f8;font:16px system-ui;display:grid;place-items:center;min-height:100vh"><p>Выполняется вход…</p><script nonce="${nonce}">sessionStorage.setItem("lumenza_preview_token",${tokenLiteral});location.replace("/home");</script></body>`,
    200,
    nonce,
  );
}
