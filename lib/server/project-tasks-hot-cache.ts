import type { ApiTask } from "../shared/api-task";
import { mergeTaskListFromRealtimeMessage } from "../shared/merge-task-list-from-realtime";
import type { RealtimeMessage } from "../shared/types";
import { getRedisPublisher, isRedisConfigured } from "./redis-clients";

const HOT_TASKS_KEY = (projectId: string) => `hot:tasks:${projectId}`;
const HOT_TASKS_TTL_SEC = 86_400;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function isApiTaskRow(v: unknown): v is ApiTask {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === "string" &&
    typeof v.projectId === "string" &&
    typeof v.title === "string" &&
    typeof v.status === "string"
  );
}

function parseHotTasks(json: string): ApiTask[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const out: ApiTask[] = [];
  for (const row of parsed) {
    if (!isApiTaskRow(row)) return null;
    out.push(row);
  }
  return out;
}

/**
 * After a successful DB mutation, merge the task list snapshot in Redis so `GET /api/tasks`
 * can serve hot reads without re-querying Postgres on every write.
 * Fire-and-forget; safe to call from API handlers.
 */
export function applyHotTaskCacheFromMessage(msg: RealtimeMessage): void {
  if (!isRedisConfigured()) return;
  if (msg.kind !== "task") return;
  void applyHotTaskCacheFromMessageAsync(msg);
}

async function applyHotTaskCacheFromMessageAsync(msg: RealtimeMessage): Promise<void> {
  if (msg.kind !== "task") return;
  const redis = await getRedisPublisher();
  if (!redis) return;

  const key = HOT_TASKS_KEY(msg.projectId);
  try {
    const raw = await redis.get(key);
    if (raw === null) {
      if (msg.event.type === "task.created" || msg.event.type === "task.updated") {
        const row = msg.event.task as ApiTask | undefined;
        if (row?.id && isApiTaskRow(row)) {
          await redis.setEx(key, HOT_TASKS_TTL_SEC, JSON.stringify([row]));
        }
      }
      return;
    }

    const prev = parseHotTasks(raw);
    if (!prev) {
      await redis.del(key);
      return;
    }

    const merged = mergeTaskListFromRealtimeMessage(prev, msg);
    if (merged === null) {
      await redis.del(key);
      return;
    }

    await redis.setEx(key, HOT_TASKS_TTL_SEC, JSON.stringify(merged));
  } catch (e) {
    console.error("[redis] hot task cache merge failed:", e);
    try {
      await redis.del(key);
    } catch {
      /* ignore */
    }
  }
}

/** Invalidate hot task list for a project (e.g. project deleted). */
export function invalidateHotTasksCache(projectId: string): void {
  if (!isRedisConfigured()) return;
  void (async () => {
    const redis = await getRedisPublisher();
    if (!redis) return;
    try {
      await redis.del(HOT_TASKS_KEY(projectId));
    } catch (e) {
      console.error("[redis] hot task cache invalidate failed:", e);
    }
  })();
}

export async function getHotTasksCached(projectId: string): Promise<ApiTask[] | null> {
  const redis = await getRedisPublisher();
  if (!redis) return null;
  try {
    const raw = await redis.get(HOT_TASKS_KEY(projectId));
    if (raw === null) return null;
    return parseHotTasks(raw);
  } catch (e) {
    console.error("[redis] hot task cache get failed:", e);
    return null;
  }
}

export async function setHotTasksFromDb(projectId: string, tasks: ApiTask[]): Promise<void> {
  const redis = await getRedisPublisher();
  if (!redis) return;
  try {
    await redis.setEx(HOT_TASKS_KEY(projectId), HOT_TASKS_TTL_SEC, JSON.stringify(tasks));
  } catch (e) {
    console.error("[redis] hot task cache set failed:", e);
  }
}
