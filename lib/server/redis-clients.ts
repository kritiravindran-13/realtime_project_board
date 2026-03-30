import { createClient, type RedisClientType } from "redis";

let publisher: RedisClientType | null = null;
let subscriber: RedisClientType | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

export async function getRedisPublisher(): Promise<RedisClientType | null> {
  if (!isRedisConfigured()) return null;
  if (!publisher) {
    publisher = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy(retries) {
          if (retries > 20) return new Error("Redis publisher reconnect limit");
          return Math.min(retries * 100, 3_000);
        },
      },
    });
    publisher.on("error", (err) => {
      console.error("[redis] publisher:", err);
    });
    await publisher.connect();
  }
  return publisher;
}

/** Separate connection required for pub/sub (node-redis). */
export async function getRedisSubscriber(): Promise<RedisClientType | null> {
  if (!isRedisConfigured()) return null;
  if (!subscriber) {
    subscriber = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy(retries) {
          if (retries > 20) return new Error("Redis subscriber reconnect limit");
          return Math.min(retries * 100, 3_000);
        },
      },
    });
    subscriber.on("error", (err) => {
      console.error("[redis] subscriber:", err);
    });
    await subscriber.connect();
  }
  return subscriber;
}
