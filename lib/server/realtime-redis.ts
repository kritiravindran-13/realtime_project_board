import type { RealtimeMessage } from "../shared/types";
import { publishToProject } from "./ws-connection-registry";
import { getRedisPublisher, getRedisSubscriber, isRedisConfigured } from "./redis-clients";

/** Must match {@link REALTIME_TOPIC} in `realtime-publish.ts` and client `ws-hub`. */
const REALTIME_TOPIC = "project";

/** Single channel; payload is a full {@link RealtimeMessage} JSON. */
export const REALTIME_REDIS_CHANNEL = "app:realtime:v1";

function isRealtimeMessage(v: unknown): v is RealtimeMessage {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (o.kind !== "task" && o.kind !== "comment" && o.kind !== "project") return false;
  return typeof o.projectId === "string";
}

/**
 * Fan out to WebSockets: Redis pub/sub when `REDIS_URL` is set (multi-instance),
 * otherwise in-process `publishToProject` only.
 */
export async function fanoutRealtimeMessageAsync(
  message: RealtimeMessage,
): Promise<number> {
  if (isRedisConfigured()) {
    const redis = await getRedisPublisher();
    if (!redis) {
      return publishToProject(message.projectId, REALTIME_TOPIC, message);
    }
    const payload = JSON.stringify(message);
    await redis.publish(REALTIME_REDIS_CHANNEL, payload);
    return 0;
  }
  return publishToProject(message.projectId, REALTIME_TOPIC, message);
}

/** Sync wrapper for existing call sites that expect a synchronous publish. */
export function fanoutRealtimeMessage(message: RealtimeMessage): number {
  if (isRedisConfigured()) {
    void fanoutRealtimeMessageAsync(message).catch((e) => {
      console.error("[redis] realtime fanout failed:", e);
    });
    return 0;
  }
  return publishToProject(message.projectId, REALTIME_TOPIC, message);
}

let subscriberStarted = false;

/**
 * Subscribe to Redis and push to local WebSocket subscribers. Idempotent.
 * Must run in the same process as `server.ts` (custom Node server).
 */
export async function startRealtimeRedisSubscriber(): Promise<void> {
  if (!isRedisConfigured() || subscriberStarted) return;

  const sub = await getRedisSubscriber();
  if (!sub) return;

  await sub.subscribe(REALTIME_REDIS_CHANNEL, (message) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(message) as unknown;
    } catch {
      console.error("[redis] invalid realtime JSON on channel");
      return;
    }
    if (!isRealtimeMessage(parsed)) {
      console.error("[redis] invalid realtime message shape");
      return;
    }
    publishToProject(parsed.projectId, REALTIME_TOPIC, parsed);
  });

  subscriberStarted = true;
  console.log(`> Redis realtime: subscribed to ${REALTIME_REDIS_CHANNEL}`);
}
