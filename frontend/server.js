const { createServer } = require("http");
const net = require("net");
const { URL } = require("url");
const next = require("next");

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const backendUrl = new URL(process.env.LUMENZA_API_ORIGIN || "http://localhost:8000");

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => handle(req, res));

  // next start/next dev не проксируют WebSocket-апгрейд вообще (см.
  // комментарий в next.config.ts) — единственный способ оставить
  // голосовой WS на одном origin с фронтендом (а значит сохранить
  // httpOnly cookie-авторизацию, которая иначе не долетит до бэкенда на
  // другом origin/порту) — вручную перехватить событие 'upgrade' здесь и
  // побайтово перетранслировать TCP-соединение в Django Channels
  // (media_ops/routing.py: ^ws/voice/$).
  server.on("upgrade", (req, socket, head) => {
    if (!req.url || !req.url.startsWith("/ws/")) {
      socket.destroy();
      return;
    }

    const backendSocket = net.connect(
      { host: backendUrl.hostname, port: Number(backendUrl.port) || 80 },
      () => {
        const requestLines = [`${req.method} ${req.url} HTTP/1.1`];
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          requestLines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
        }
        backendSocket.write(requestLines.join("\r\n") + "\r\n\r\n");
        if (head && head.length) backendSocket.write(head);
        socket.pipe(backendSocket);
        backendSocket.pipe(socket);
      }
    );
    backendSocket.on("error", () => socket.destroy());
    socket.on("error", () => backendSocket.destroy());
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port} (${dev ? "dev" : "production"})`);
  });
});
