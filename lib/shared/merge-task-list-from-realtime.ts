import type { ApiTask } from "./api-task";
import type { RealtimeMessage } from "./types";

/**
 * Applies a task realtime event to a task list (same semantics as the client hook merge).
 * Returns `null` when the merge cannot be applied (caller should refetch or invalidate cache).
 */
export function mergeTaskListFromRealtimeMessage(
  tasks: ApiTask[],
  msg: RealtimeMessage,
): ApiTask[] | null {
  if (msg.kind !== "task") return null;
  const ev = msg.event;
  switch (ev.type) {
    case "task.created":
    case "task.updated": {
      const row = ev.task as ApiTask | undefined;
      if (!row?.id) return null;
      const idx = tasks.findIndex((t) => t.id === row.id);
      if (idx === -1) return [...tasks, row].sort((a, b) => a.id.localeCompare(b.id));
      const next = [...tasks];
      next[idx] = row;
      return next;
    }
    case "task.deleted":
      return tasks.filter((t) => t.id !== ev.taskId);
    case "task.statusChanged": {
      const idx = tasks.findIndex((t) => t.id === ev.taskId);
      if (idx === -1) return null;
      const next = [...tasks];
      const t = next[idx];
      if (!t) return null;
      next[idx] = { ...t, status: ev.toStatus };
      return next;
    }
    case "task.dependenciesChanged": {
      const idx = tasks.findIndex((t) => t.id === ev.taskId);
      if (idx === -1) return null;
      const next = [...tasks];
      const t = next[idx];
      if (!t) return null;
      next[idx] = {
        ...t,
        dependencies: ev.dependencyIds.map((id) => ({ id })),
      };
      return next;
    }
    default:
      return null;
  }
}
