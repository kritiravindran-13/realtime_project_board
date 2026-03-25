/**
 * Shared helpers for WebSocket realtime E2E scripts.
 */

import WebSocket from "ws";

export const DEFAULT_BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
export const DEFAULT_TIMEOUT_MS = 12_000;

/** Must match {@link REALTIME_TOPIC} in lib/server/realtime-publish.ts */
export const REALTIME_TOPIC = "project";

export function httpToWs(base: string): string {
  const u = new URL(base);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  return u.origin;
}

export function makeJsonStream(ws: WebSocket) {
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

export function isRecord(o: unknown): o is Record<string, unknown> {
  return typeof o === "object" && o !== null;
}

export function fail(msg: string): never {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

export async function fetchJson(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = `${new URL(baseUrl).origin}${path}`;
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data: unknown = null;
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  return { ok: res.ok, status: res.status, data };
}

/** Assert next WS frame is `{ topic: "project", payload: RealtimeMessage }`. */
export async function expectRealtime(
  stream: ReturnType<typeof makeJsonStream>,
  kind: "task" | "comment" | "project",
  eventType: string,
  timeoutMs: number,
): Promise<{ projectId: string; event: Record<string, unknown> }> {
  const msg = await stream.next(timeoutMs);
  if (!isRecord(msg) || msg.topic !== REALTIME_TOPIC) {
    fail(`Expected { topic: "${REALTIME_TOPIC}", ... }, got: ${JSON.stringify(msg)}`);
  }
  const payload = msg.payload;
  if (!isRecord(payload) || payload.kind !== kind) {
    fail(`Expected kind "${kind}", got: ${JSON.stringify(payload)}`);
  }
  const projectId = payload.projectId;
  if (typeof projectId !== "string") {
    fail(`Missing projectId on payload: ${JSON.stringify(payload)}`);
  }
  const event = payload.event;
  if (!isRecord(event) || event.type !== eventType) {
    fail(`Expected event.type "${eventType}", got: ${JSON.stringify(event)}`);
  }
  return { projectId, event };
}
