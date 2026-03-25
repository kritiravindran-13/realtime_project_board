import { createServer } from "node:http";
import { URL } from "node:url";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import {
  handleClientMessage,
  registerWebSocketClient,
  startWebSocketHeartbeat,
} from "./lib/server/ws-connection-registry";
import { registerWebSocketServer } from "./lib/server/ws-registry";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";

const app = next({
  dev,
  turbopack: dev,
});

const wss = new WebSocketServer({
  noServer: true,
  // Avoid rare negotiation issues with some clients / dev proxies.
  perMessageDeflate: false,
});
registerWebSocketServer(wss);
startWebSocketHeartbeat(30_000);

wss.on("connection", (ws, req) => {
  ws.on("error", (err) => {
    console.error("[ws] socket error:", err);
  });

  const meta = registerWebSocketClient(ws);

  ws.on("message", (raw) => {
    handleClientMessage(ws, raw);
  });

  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  ws.send(
    JSON.stringify({
      type: "welcome",
      path: url.pathname,
      clientId: meta.clientId,
    }),
  );
});

function isAppWebSocketPath(pathname: string): boolean {
  // Keep exact match so /api/ws/publish stays HTTP-only.
  // Do not add `src/app/api/ws/route.ts`: Next's dev upgrade handler runs after this
  // and calls `socket.end()` when a route matches the same path, which breaks WS.
  return pathname === "/api/ws";
}

async function main() {
  await app.prepare();
  const handle = app.getRequestHandler();
  const upgradeHandler = app.getUpgradeHandler();

  const server = createServer((req, res) => {
    void handle(req, res);
  });

  // After Upgrade, the socket is long-lived; Node’s default HTTP timeouts can
  // tear it down and clients see abnormal close (1006).
  server.keepAliveTimeout = 0;
  server.headersTimeout = 0;
  if ("requestTimeout" in server) {
    (server as { requestTimeout: number }).requestTimeout = 0;
  }

  server.on("upgrade", (req, socket, head) => {
    const hostHeader = req.headers.host ?? "localhost";
    const pathname = new URL(req.url ?? "/", `http://${hostHeader}`).pathname;

    if (isAppWebSocketPath(pathname)) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return;
    }

    void upgradeHandler(req, socket, head);
  });

  server.listen(port, host, () => {
    console.log(
      `> Ready on http://${host}:${port} (${dev ? "development" : process.env.NODE_ENV})`,
    );
    const wsHintHost = host === "0.0.0.0" || host === "::" ? "localhost" : host;
    console.log(`> WebSocket: ws://${wsHintHost}:${port}/api/ws`);
  });
}

void main();
