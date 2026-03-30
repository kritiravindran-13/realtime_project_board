/**
 * Redis integration checks (no Next server required):
 * - Pub/sub on {@link REALTIME_REDIS_CHANNEL} (same channel as realtime fanout)
 * - Hot task list cache: set, merge via applyHotTaskCacheFromMessage, invalidate
 * - {@link fanoutRealtimeMessageAsync} delivers JSON to a subscriber
 *
 * Requires a running Redis and `REDIS_URL` (e.g. `redis://127.0.0.1:6379`).
 * If `REDIS_URL` is unset, exits 0 with a skip message.
 *
 *   REDIS_URL=redis://127.0.0.1:6379 npx tsx scripts/test-redis.ts
 *   npm run test:redis
 */

import { createClient, type RedisClientType } from "redis";
import type { RealtimeMessage } from "../lib/shared/types";

const DEFAULT_REDIS = "redis://127.0.0.1:6379";

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fail fast when Redis is down (no infinite reconnect / log spam). */
function createTestClient(redisUrl: string): RedisClientType {
  return createClient({
    url: redisUrl,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: () => new Error("[test-redis] reconnect disabled"),
    },
  });
}

async function assertRedisPing(redisUrl: string): Promise<void> {
  const c = createTestClient(redisUrl);
  try {
    await c.connect();
    const pong = await c.ping();
    if (pong !== "PONG") {
      fail(`Unexpected PING reply: ${String(pong)}`);
    }
    await c.quit();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail(
      `Cannot reach Redis (${redisUrl.replace(/:[^:@/]+@/, ":****@")}). ` +
        `Start a server or fix REDIS_URL. ${msg}`,
    );
  }
}

async function testRawPubSub(redisUrl: string, channel: string): Promise<void> {
  const sub = createTestClient(redisUrl);
  const pub = createTestClient(redisUrl);
  await sub.connect();
  await pub.connect();

  const received: string[] = [];
  await sub.subscribe(channel, (message) => {
    received.push(message);
  });

  const payload = JSON.stringify({ probe: "test-redis", t: Date.now() });
  const n = await pub.publish(channel, payload);
  if (n < 1) {
    fail(`Expected at least one Redis subscriber for channel ${channel}, got ${n}`);
  }

  await sleep(100);
  if (received.length !== 1 || received[0] !== payload) {
    fail(`Pub/sub mismatch: expected one frame ${payload}, got ${JSON.stringify(received)}`);
  }

  await sub.unsubscribe(channel);
  await sub.quit();
  await pub.quit();
  console.log("OK  raw Redis PUBLISH/SUBSCRIBE on realtime channel");
}

async function testHotTaskCache(redisUrl: string): Promise<void> {
  process.env.REDIS_URL = redisUrl;

  const hot = await import("../lib/server/project-tasks-hot-cache");
  const projectId = `redis-hot-${Date.now()}`;

  const empty = await hot.getHotTasksCached(projectId);
  if (empty !== null) {
    fail(`Expected no hot cache initially, got ${JSON.stringify(empty)}`);
  }

  const t1 = {
    id: "task-1",
    projectId,
    title: "First",
    status: "todo",
  };

  await hot.setHotTasksFromDb(projectId, [t1]);
  const afterSet = await hot.getHotTasksCached(projectId);
  if (!afterSet || afterSet.length !== 1 || afterSet[0].title !== "First") {
    fail(`setHotTasksFromDb/read back failed: ${JSON.stringify(afterSet)}`);
  }

  hot.applyHotTaskCacheFromMessage({
    kind: "task",
    projectId,
    event: {
      type: "task.updated",
      taskId: t1.id,
      task: { ...t1, title: "Renamed" },
    },
  });
  await sleep(200);
  const afterMerge = await hot.getHotTasksCached(projectId);
  if (!afterMerge || afterMerge[0].title !== "Renamed") {
    fail(`Hot cache merge failed: ${JSON.stringify(afterMerge)}`);
  }

  hot.invalidateHotTasksCache(projectId);
  await sleep(150);
  const afterInv = await hot.getHotTasksCached(projectId);
  if (afterInv !== null) {
    fail(`Expected cache cleared after invalidate, got ${JSON.stringify(afterInv)}`);
  }

  const redis = await import("../lib/server/redis-clients");
  const client = await redis.getRedisPublisher();
  if (client) {
    await client.del(`hot:tasks:${projectId}`);
  }

  console.log("OK  hot task cache set / merge / invalidate");
}

async function testFanoutAsync(redisUrl: string): Promise<void> {
  process.env.REDIS_URL = redisUrl;

  const { fanoutRealtimeMessageAsync, REALTIME_REDIS_CHANNEL } = await import(
    "../lib/server/realtime-redis"
  );
  if (REALTIME_REDIS_CHANNEL !== "app:realtime:v1") {
    fail(`Channel constant drift: ${REALTIME_REDIS_CHANNEL}`);
  }

  const message: RealtimeMessage = {
    kind: "task",
    projectId: `fanout-${Date.now()}`,
    event: { type: "task.deleted", taskId: "ghost-task" },
  };

  const listener = createTestClient(redisUrl);
  await listener.connect();

  const frames: string[] = [];
  await listener.subscribe(REALTIME_REDIS_CHANNEL, (m) => {
    frames.push(m);
  });

  await sleep(50);
  await fanoutRealtimeMessageAsync(message);
  await sleep(200);

  if (frames.length !== 1) {
    fail(`fanoutRealtimeMessageAsync: expected 1 frame, got ${frames.length}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(frames[0]!) as unknown;
  } catch {
    fail("fanout: invalid JSON");
  }
  const o = parsed as Record<string, unknown>;
  if (o.kind !== "task" || o.projectId !== message.projectId) {
    fail(`fanout payload mismatch: ${JSON.stringify(parsed)}`);
  }

  await listener.unsubscribe(REALTIME_REDIS_CHANNEL);
  await listener.quit();
  console.log("OK  fanoutRealtimeMessageAsync publishes to Redis channel");
}

async function main(): Promise<void> {
  const redisUrl = process.env.REDIS_URL?.trim() || "";
  if (!redisUrl) {
    console.log(
      "SKIP  Redis tests (set REDIS_URL, e.g. redis://127.0.0.1:6379). Default probe uses same host.",
    );
    console.log(`       Example: REDIS_URL=${DEFAULT_REDIS} npx tsx scripts/test-redis.ts`);
    process.exit(0);
  }

  console.log(`Redis: ${redisUrl.replace(/:[^:@/]+@/, ":****@")}`);
  await assertRedisPing(redisUrl);

  const { REALTIME_REDIS_CHANNEL } = await import("../lib/server/realtime-redis");
  await testRawPubSub(redisUrl, REALTIME_REDIS_CHANNEL);
  await testHotTaskCache(redisUrl);
  await testFanoutAsync(redisUrl);

  console.log("\nAll Redis checks passed.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
