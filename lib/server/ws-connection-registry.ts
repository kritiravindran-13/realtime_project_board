import { randomUUID } from "node:crypto";
import { WebSocket, type RawData } from "ws";

export type ClientMeta = {
  clientId: string;
  projectIds: Set<string>;
  /** Cleared each heartbeat tick; set true again when a pong is received. */
  isAlive: boolean;
};

/**
 * Inbound JSON from clients (application-level protocol).
 *
 * - subscribe / unsubscribe: project-scoped push channels
 * - ping: optional RTT / keepalive; server replies with { type: "pong" }
 *
 * Server→client heartbeats use WebSocket ping/pong frames (see runHeartbeatTick).
 */
export type InboundMessage =
  | { type: "subscribe"; projectId: string }
  | { type: "unsubscribe"; projectId: string }
  | { type: "ping" };

/** Well-known symbol (backup lookup). Primary lookup is numeric id + global Map (see below). */
const WS_CLIENT_META = Symbol.for("next-app.wsClientMeta");

/** Opaque connection id stored on the socket; survives better than Map<WebSocket> across tooling edge cases. */
const WS_CONN_ID_PROP = "__nextAppWsConnId" as const;

type WebSocketWithMeta = WebSocket & {
  [WS_CLIENT_META]?: ClientMeta;
  [WS_CONN_ID_PROP]?: number;
};

function nextConnectionId(): number {
  const g = globalThis as WsRegistryGlobal;
  g.__wsConnSeq = (g.__wsConnSeq ?? 0) + 1;
  return g.__wsConnSeq;
}

function getClientMeta(ws: WebSocket): ClientMeta | undefined {
  const id = (ws as WebSocketWithMeta)[WS_CONN_ID_PROP];
  if (typeof id === "number" && Number.isFinite(id)) {
    const fromMap = getStores().metaByConnId.get(id);
    if (fromMap) return fromMap;
  }
  return (ws as WebSocketWithMeta)[WS_CLIENT_META];
}

function setClientMeta(ws: WebSocket, meta: ClientMeta, connId: number): void {
  (ws as WebSocketWithMeta)[WS_CONN_ID_PROP] = connId;
  (ws as WebSocketWithMeta)[WS_CLIENT_META] = meta;
  getStores().metaByConnId.set(connId, meta);
}

function clearClientMeta(ws: WebSocket): void {
  const id = (ws as WebSocketWithMeta)[WS_CONN_ID_PROP];
  if (typeof id === "number") {
    getStores().metaByConnId.delete(id);
  }
  delete (ws as WebSocketWithMeta)[WS_CONN_ID_PROP];
  delete (ws as WebSocketWithMeta)[WS_CLIENT_META];
}

/**
 * Next may load App Route handlers in a separate module graph from `server.ts`.
 * Storing state on `globalThis` guarantees subscribe (WS) and publish (HTTP) share it.
 *
 * We keep client metadata on the socket via `Symbol.for` instead of only `Map<WebSocket,…>`,
 * because in some dev setups two copies of `ws` can load; `Map` identity would then break
 * between `registerWebSocketClient` and `message` handlers.
 */
type WsRegistryGlobal = typeof globalThis & {
  __wsClientSockets?: Set<WebSocket>;
  __wsMetaByConnId?: Map<number, ClientMeta>;
  __wsConnSeq?: number;
  __wsConnectionProjectSubs?: Map<string, Set<WebSocket>>;
  __wsHeartbeatTimer?: ReturnType<typeof setInterval>;
  /** Legacy Map from older builds; migrated on first access */
  __wsConnectionClients?: Map<WebSocket, ClientMeta>;
};

function migrateLegacyClientMap(g: WsRegistryGlobal): Set<WebSocket> {
  const set = new Set<WebSocket>();
  const metaByConnId = g.__wsMetaByConnId ?? new Map<number, ClientMeta>();
  if (!g.__wsMetaByConnId) {
    g.__wsMetaByConnId = metaByConnId;
  }
  const legacy = g.__wsConnectionClients;
  if (legacy instanceof Map) {
    let seq = g.__wsConnSeq ?? 0;
    for (const [sock, meta] of legacy) {
      seq += 1;
      g.__wsConnSeq = seq;
      (sock as WebSocketWithMeta)[WS_CONN_ID_PROP] = seq;
      (sock as WebSocketWithMeta)[WS_CLIENT_META] = meta;
      metaByConnId.set(seq, meta);
      set.add(sock);
    }
    delete g.__wsConnectionClients;
  }
  return set;
}

function getStores() {
  const g = globalThis as WsRegistryGlobal;
  if (!g.__wsClientSockets) {
    g.__wsClientSockets = migrateLegacyClientMap(g);
  }
  if (!g.__wsMetaByConnId) {
    g.__wsMetaByConnId = new Map();
  }
  if (!g.__wsConnectionProjectSubs) {
    g.__wsConnectionProjectSubs = new Map();
  }
  return {
    clientSockets: g.__wsClientSockets,
    metaByConnId: g.__wsMetaByConnId,
    projectSubscriptions: g.__wsConnectionProjectSubs,
  };
}

function subscribe(ws: WebSocket, projectId: string): void {
  const { projectSubscriptions: ps } = getStores();
  const meta = getClientMeta(ws);
  if (!meta) return;

  meta.projectIds.add(projectId);

  let set = ps.get(projectId);
  if (!set) {
    set = new Set();
    ps.set(projectId, set);
  }
  set.add(ws);
}

function unsubscribe(ws: WebSocket, projectId: string): void {
  const { projectSubscriptions: ps } = getStores();
  const meta = getClientMeta(ws);
  if (!meta) return;

  meta.projectIds.delete(projectId);

  const set = ps.get(projectId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      ps.delete(projectId);
    }
  }
}

/**
 * On close/error: remove ws from every project set, then drop from clients.
 */
export function removeClient(ws: WebSocket): void {
  const { clientSockets, projectSubscriptions: ps } = getStores();
  const meta = getClientMeta(ws);
  if (!meta) return;

  for (const projectId of meta.projectIds) {
    const set = ps.get(projectId);
    if (set) {
      set.delete(ws);
      if (set.size === 0) {
        ps.delete(projectId);
      }
    }
  }

  clearClientMeta(ws);
  clientSockets.delete(ws);
}

function parseText(raw: RawData): string {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return Buffer.from(raw).toString("utf8");
}

/**
 * Parse a single JSON text frame into a known inbound message, or null if invalid.
 */
export function parseInboundMessage(text: string): InboundMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const t = o.type;

  if (t === "ping") {
    return { type: "ping" };
  }

  if (t !== "subscribe" && t !== "unsubscribe") return null;
  if (typeof o.projectId !== "string" || o.projectId.trim().length === 0) {
    return null;
  }
  return { type: t, projectId: o.projectId.trim() };
}

const PROTOCOL_HINT =
  'JSON: { "type": "subscribe"|"unsubscribe", "projectId": "..." } or { "type": "ping" }';

/**
 * Central handler: parse frame, update registry / meta, send replies.
 */
export function handleClientMessage(ws: WebSocket, raw: RawData): void {
  if (!getClientMeta(ws)) return;

  const text = parseText(raw);
  const msg = parseInboundMessage(text);
  if (!msg) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: `Invalid message. Expected ${PROTOCOL_HINT}`,
      }),
    );
    return;
  }

  if (msg.type === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
    return;
  }

  if (msg.type === "subscribe") {
    subscribe(ws, msg.projectId);
    ws.send(JSON.stringify({ type: "subscribed", projectId: msg.projectId }));
    return;
  }

  unsubscribe(ws, msg.projectId);
  ws.send(JSON.stringify({ type: "unsubscribed", projectId: msg.projectId }));
}

/**
 * One heartbeat pass: drop sockets that missed the previous ping/pong cycle;
 * mark others for the next cycle and send a WebSocket ping frame.
 */
export function runHeartbeatTick(): void {
  const { clientSockets } = getStores();
  const toTerminate: WebSocket[] = [];

  for (const socket of clientSockets) {
    const meta = getClientMeta(socket);
    if (!meta) continue;
    if (!meta.isAlive) {
      toTerminate.push(socket);
      continue;
    }
    meta.isAlive = false;
    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
  }

  for (const s of toTerminate) {
    s.terminate();
  }
}

/** Start periodic heartbeat (idempotent). Default 30s. */
export function startWebSocketHeartbeat(intervalMs = 30_000): void {
  const g = globalThis as WsRegistryGlobal;
  if (g.__wsHeartbeatTimer) return;
  g.__wsHeartbeatTimer = setInterval(runHeartbeatTick, intervalMs);
}

/**
 * On connection: clientId, ClientMeta, register socket + meta.
 * Wires message / pong / close handlers.
 */
export function registerWebSocketClient(ws: WebSocket): ClientMeta {
  const { clientSockets } = getStores();
  const clientId = randomUUID();
  const meta: ClientMeta = {
    clientId,
    projectIds: new Set(),
    isAlive: true,
  };
  setClientMeta(ws, meta, nextConnectionId());
  clientSockets.add(ws);

  ws.on("pong", () => {
    const m = getClientMeta(ws);
    if (m) m.isAlive = true;
  });

  // `message` is wired from `server.ts` so the listener always shares the same module
  // graph as the HTTP upgrade path (avoids rare duplicate-registry dev issues).

  // Only remove on `close`. Some stacks emit transient `error` without tearing down
  // the socket immediately; removing on `error` can race with inbound frames.
  ws.once("close", () => removeClient(ws));

  return meta;
}

/** Sockets subscribed to a project (for targeted publish). */
export function getSocketsForProject(projectId: string): ReadonlySet<WebSocket> | undefined {
  return getStores().projectSubscriptions.get(projectId);
}

/** Push `{ topic, payload }` JSON to every socket subscribed to `projectId`. */
export function publishToProject<T>(projectId: string, topic: string, payload: T): number {
  const set = getStores().projectSubscriptions.get(projectId);
  if (!set?.size) return 0;
  const data = JSON.stringify({ topic, payload });
  let n = 0;
  for (const sock of set) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(data);
      n++;
    }
  }
  return n;
}
