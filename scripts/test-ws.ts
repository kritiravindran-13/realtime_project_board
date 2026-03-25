/**
 * WebSocket protocol smoke test (subscribe / unsubscribe / ping / publish).
 *
 * Requires the custom server: `npm run dev` (not `next dev` alone).
 * After changing `lib/server/ws-connection-registry.ts` or `server.ts`, restart the dev server.
 * If messages hang after `welcome`, run the dev server with `WS_DEBUG=1 npm run dev` and check logs.
 *
 * Usage:
 *   npm run test:ws
 *   BASE_URL=http://127.0.0.1:3000 npx tsx scripts/test-ws.ts
 *   npx tsx scripts/test-ws.ts --with-heartbeat   # waits ~32s; verifies ping/pong keepalive
 */

import WebSocket from "ws";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const WITH_HEARTBEAT = process.argv.includes("--with-heartbeat");
/** Must match server `startWebSocketHeartbeat` interval when testing heartbeat */
const HEARTBEAT_INTERVAL_MS = 30_000;

function httpToWs(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.origin;
}

function makeJsonStream(ws: WebSocket) {
  const pending: unknown[] = [];
  let resolveNext: ((v: unknown) => void) | null = null;

  ws.on("message", (raw) => {
    let o: unknown;
    try {
      o = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r(o);
    } else {
      pending.push(o);
    }
  });

  return {
    next(timeoutMs: number): Promise<unknown> {
      if (pending.length > 0) {
        return Promise.resolve(pending.shift()!);
      }
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          if (resolveNext === resolveWrapper) resolveNext = null;
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for a JSON message`));
        }, timeoutMs);
        const resolveWrapper = (v: unknown) => {
          clearTimeout(t);
          resolve(v);
        };
        resolveNext = resolveWrapper;
      });
    },
  };
}

function isRecord(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" && o !== null;
}

function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

async function main() {
  const origin = new URL(BASE_URL).origin;
  const wsUrl = `${httpToWs(origin)}/api/ws`;

  console.log(`Base: ${origin}`);
  console.log(`WS:   ${wsUrl}`);

  const projectRes = await fetch(`${origin}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "WS test script", description: "scripts/test-ws.ts" }),
  });
  if (!projectRes.ok) {
    const t = await projectRes.text();
    fail(`POST /api/projects -> ${projectRes.status}: ${t}`);
  }
  const project = (await projectRes.json()) as { id: string };
  if (typeof project.id !== "string" || !project.id) {
    fail("POST /api/projects: missing id in JSON");
  }
  const projectId = project.id;
  console.log(`Project: ${projectId}`);

  const ws = new WebSocket(wsUrl);
  const stream = makeJsonStream(ws);

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(e));
  });

  const next = (ms = 8_000) => stream.next(ms);

  const welcome = await next();
  if (!isRecord(welcome) || welcome.type !== "welcome") {
    fail(`Expected welcome, got: ${JSON.stringify(welcome)}`);
  }
  console.log("OK  welcome", { clientId: welcome.clientId });

  ws.send(JSON.stringify({ type: "subscribe", projectId }));
  const sub = await next();
  if (!isRecord(sub) || sub.type !== "subscribed" || sub.projectId !== projectId) {
    fail(`Expected subscribed, got: ${JSON.stringify(sub)}`);
  }
  console.log("OK  subscribed");

  ws.send(JSON.stringify({ type: "ping" }));
  const pong = await next();
  if (!isRecord(pong) || pong.type !== "pong") {
    fail(`Expected pong, got: ${JSON.stringify(pong)}`);
  }
  console.log("OK  ping -> pong");

  const topic = "test-ws-script";
  const payload = { n: 1, from: "scripts/test-ws.ts" };
  const pubRes = await fetch(`${origin}/api/ws/publish/project`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, topic, payload }),
  });
  const pubBody = await pubRes.json();
  if (!pubRes.ok || !isRecord(pubBody) || pubBody.recipients !== 1) {
    fail(`POST /api/ws/publish/project -> ${pubRes.status}: ${JSON.stringify(pubBody)}`);
  }
  console.log("OK  publish HTTP", pubBody);

  const pushed = await next();
  if (
    !isRecord(pushed) ||
    pushed.topic !== topic ||
    JSON.stringify(pushed.payload) !== JSON.stringify(payload)
  ) {
    fail(`Expected push { topic, payload }, got: ${JSON.stringify(pushed)}`);
  }
  console.log("OK  push over WS");

  ws.send(JSON.stringify({ type: "unsubscribe", projectId }));
  const unsub = await next();
  if (!isRecord(unsub) || unsub.type !== "unsubscribed") {
    fail(`Expected unsubscribed, got: ${JSON.stringify(unsub)}`);
  }
  console.log("OK  unsubscribed");

  ws.send(JSON.stringify({ type: "not-a-real-command" }));
  const err = await next();
  if (!isRecord(err) || err.type !== "error") {
    fail(`Expected error for bad type, got: ${JSON.stringify(err)}`);
  }
  console.log("OK  invalid command -> error");

  if (WITH_HEARTBEAT) {
    const waitMs = HEARTBEAT_INTERVAL_MS + 2_000;
    console.log(`--with-heartbeat: waiting ${waitMs}ms for server ping/pong cycle...`);
    await new Promise((r) => setTimeout(r, waitMs));
    if (ws.readyState !== WebSocket.OPEN) {
      fail(`Socket closed during heartbeat wait (readyState=${ws.readyState})`);
    }
    ws.send(JSON.stringify({ type: "ping" }));
    const pong2 = await next();
    if (!isRecord(pong2) || pong2.type !== "pong") {
      fail(`After heartbeat wait, expected pong, got: ${JSON.stringify(pong2)}`);
    }
    console.log("OK  still alive after heartbeat tick(s)");
  }

  ws.close();
  console.log("\nAll checks passed.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
