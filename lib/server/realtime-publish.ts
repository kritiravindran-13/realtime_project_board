import type {
  CommentRealtimeEvent,
  ProjectRealtimeEvent,
  RealtimeMessage,
  TaskRealtimeEvent,
} from "../shared/types";
import { applyHotTaskCacheFromMessage, invalidateHotTasksCache } from "./project-tasks-hot-cache";
import { fanoutRealtimeMessage } from "./realtime-redis";

export const REALTIME_TOPIC = "project";

export function publishRealtimeMessage(message: RealtimeMessage): number {
  return fanoutRealtimeMessage(message);
}

export function publishTaskEvent(projectId: string, event: TaskRealtimeEvent): number {
  const message: RealtimeMessage = { kind: "task", projectId, event };
  applyHotTaskCacheFromMessage(message);
  return fanoutRealtimeMessage(message);
}

export function publishCommentEvent(
  projectId: string,
  event: CommentRealtimeEvent,
): number {
  return fanoutRealtimeMessage({ kind: "comment", projectId, event });
}

export function publishProjectEvent(
  projectId: string,
  event: ProjectRealtimeEvent,
): number {
  if (event.type === "project.deleted") {
    invalidateHotTasksCache(projectId);
  }
  return fanoutRealtimeMessage({ kind: "project", projectId, event });
}
