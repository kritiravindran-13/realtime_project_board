import type {
  CommentRealtimeEvent,
  ProjectRealtimeEvent,
  RealtimeMessage,
  TaskRealtimeEvent,
} from "../shared/types";
import { publishToProject } from "./ws-connection-registry";

export const REALTIME_TOPIC = "project";

export function publishRealtimeMessage(message: RealtimeMessage): number {
  return publishToProject(message.projectId, REALTIME_TOPIC, message);
}

export function publishTaskEvent(projectId: string, event: TaskRealtimeEvent): number {
  return publishRealtimeMessage({ kind: "task", projectId, event });
}

export function publishCommentEvent(
  projectId: string,
  event: CommentRealtimeEvent,
): number {
  return publishRealtimeMessage({ kind: "comment", projectId, event });
}

export function publishProjectEvent(
  projectId: string,
  event: ProjectRealtimeEvent,
): number {
  return publishRealtimeMessage({ kind: "project", projectId, event });
}
