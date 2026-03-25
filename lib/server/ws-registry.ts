import { WebSocket, type WebSocketServer } from "ws";

type WsGlobal = typeof globalThis & {
  __wsBroadcastServer?: WebSocketServer | null;
};

function getWss(): WebSocketServer | null {
  const g = globalThis as WsGlobal;
  return g.__wsBroadcastServer ?? null;
}

export function registerWebSocketServer(server: WebSocketServer) {
  const g = globalThis as WsGlobal;
  g.__wsBroadcastServer = server;
}

export function getWebSocketServer(): WebSocketServer | null {
  return getWss();
}

export type WsOutboundMessage<T = unknown> = {
  topic: string;
  payload: T;
};

/**
 * Broadcast a JSON message to every connected /api/ws client.
 * Returns how many sockets received the message.
 */
export function publish<T>(topic: string, payload: T): number {
  const wss = getWss();
  if (!wss) return 0;
  const data = JSON.stringify({ topic, payload } satisfies WsOutboundMessage<T>);
  let n = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
      n++;
    }
  }
  return n;
}
