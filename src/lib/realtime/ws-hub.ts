import type { RealtimeMessage } from "../../../lib/shared/types";

export type RealtimeConnectionStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

function wsUrl(): string {
  if (typeof window === "undefined") return "";
  const { protocol, host } = window.location;
  const p = protocol === "https:" ? "wss:" : "ws:";
  return `${p}//${host}/api/ws`;
}

function isProjectFrame(data: unknown): data is { topic: string; payload: RealtimeMessage } {
  if (!data || typeof data !== "object") return false;
  const o = data as Record<string, unknown>;
  if (o.topic !== "project" || !o.payload || typeof o.payload !== "object") return false;
  const pl = o.payload as Record<string, unknown>;
  return (
    typeof pl.projectId === "string" &&
    (pl.kind === "task" || pl.kind === "comment" || pl.kind === "project") &&
    pl.event !== undefined
  );
}

type Room = {
  refCount: number;
  ws: WebSocket | null;
  status: RealtimeConnectionStatus;
  projectId: string;
  eventListeners: Set<(msg: RealtimeMessage) => void>;
  statusListeners: Set<() => void>;
};

const rooms = new Map<string, Room>();

function getRoom(projectId: string): Room {
  let r = rooms.get(projectId);
  if (!r) {
    r = {
      refCount: 0,
      ws: null,
      status: "idle",
      projectId,
      eventListeners: new Set(),
      statusListeners: new Set(),
    };
    rooms.set(projectId, r);
  }
  return r;
}

function notifyStatus(room: Room) {
  room.statusListeners.forEach((fn) => fn());
}

function setStatus(room: Room, status: RealtimeConnectionStatus) {
  room.status = status;
  notifyStatus(room);
}

function emitEvent(room: Room, msg: RealtimeMessage) {
  room.eventListeners.forEach((fn) => {
    try {
      fn(msg);
    } catch {
      /* consumer error — isolate */
    }
  });
}

function disconnect(room: Room) {
  if (room.ws) {
    room.ws.onopen = null;
    room.ws.onclose = null;
    room.ws.onerror = null;
    room.ws.onmessage = null;
    try {
      room.ws.close();
    } catch {
      /* ignore */
    }
    room.ws = null;
  }
  setStatus(room, "closed");
}

function connect(room: Room) {
  if (room.ws?.readyState === WebSocket.OPEN) return;
  disconnect(room);

  const url = wsUrl();
  if (!url) return;

  setStatus(room, "connecting");
  const ws = new WebSocket(url);
  room.ws = ws;

  ws.onopen = () => {
    /* wait for welcome then subscribe */
  };

  ws.onerror = () => {
    setStatus(room, "error");
  };

  ws.onclose = () => {
    room.ws = null;
    if (room.refCount > 0) {
      setStatus(room, "closed");
    } else {
      setStatus(room, "idle");
    }
  };

  ws.onmessage = (ev) => {
    let data: unknown;
    try {
      data = JSON.parse(String(ev.data));
    } catch {
      return;
    }
    if (!data || typeof data !== "object") return;
    const o = data as Record<string, unknown>;

    if (o.type === "welcome") {
      ws.send(JSON.stringify({ type: "subscribe", projectId: room.projectId }));
      return;
    }
    if (o.type === "subscribed") {
      setStatus(room, "open");
      return;
    }
    if (isProjectFrame(data)) {
      emitEvent(room, data.payload);
    }
  };
}

/** First consumer opens the socket; last consumer closes it. */
export function acquireProjectRoom(projectId: string): void {
  const room = getRoom(projectId);
  room.refCount += 1;
  if (room.refCount === 1) {
    connect(room);
  }
}

export function releaseProjectRoom(projectId: string): void {
  const room = rooms.get(projectId);
  if (!room) return;
  room.refCount = Math.max(0, room.refCount - 1);
  if (room.refCount === 0) {
    disconnect(room);
    rooms.delete(projectId);
  }
}

export function subscribeProjectEvents(
  projectId: string,
  fn: (msg: RealtimeMessage) => void,
): () => void {
  const room = getRoom(projectId);
  room.eventListeners.add(fn);
  return () => {
    room.eventListeners.delete(fn);
  };
}

export function subscribeProjectStatus(
  projectId: string,
  fn: () => void,
): () => void {
  const room = getRoom(projectId);
  room.statusListeners.add(fn);
  return () => {
    room.statusListeners.delete(fn);
  };
}

export function getProjectRoomStatus(projectId: string): RealtimeConnectionStatus {
  return rooms.get(projectId)?.status ?? "idle";
}
