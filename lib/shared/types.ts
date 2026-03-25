export type ID = string;

export type User = {
  id: ID;
  name: string;
  /**
   * Optional profile fields. The app can store either IDs or denormalized values.
   */
  email?: string;
};

export type Project = {
  id: ID;
  name: string;
  description?: string | null;
  /**
   * Free-form metadata stored as JSON in the database.
   */
  metadata?: Record<string, unknown> | null;
};

export type TaskConfiguration = {
  priority: number;
  description?: string | null;
  tags: string[];
  customFields: Record<string, unknown>;
};

export type Task = {
  id: ID;
  projectId: ID;
  title: string;
  status: string;

  /**
   * Assigned user IDs (many-to-many in the database).
   */
  assignedTo?: ID[] | null;

  /**
   * { priority, description, tags[], customFields } (stored as JSON in the database).
   */
  configuration?: TaskConfiguration | null;

  /**
   * Task IDs that this task depends on.
   */
  dependencies?: ID[] | null;
};

export type Comment = {
  id: ID;
  taskId: ID;
  content: string;
  authorId: ID;
  /** Display name from related User (API may nest under `author`). */
  author?: string;
  timestamp: Date;
};

export type TaskEvent =
  | {
      type: "task.created";
      eventId: ID;
      occurredAt: Date;
      taskId: ID;
      projectId: ID;
      actor?: ID | null;
      data: {
        title: string;
        status: string;
      };
    }
  | {
      type: "task.statusChanged";
      eventId: ID;
      occurredAt: Date;
      taskId: ID;
      projectId: ID;
      actor?: ID | null;
      data: {
        fromStatus: string;
        toStatus: string;
      };
    }
  | {
      type: "task.assigned";
      eventId: ID;
      occurredAt: Date;
      taskId: ID;
      projectId: ID;
      actor?: ID | null;
      data: {
        assignedTo: ID[];
      };
    }
  | {
      type: "task.commentAdded";
      eventId: ID;
      occurredAt: Date;
      taskId: ID;
      projectId: ID;
      actor?: ID | null;
      data: {
        commentId: ID;
        content: string;
      };
    }
  | {
      type: "task.dependencyAdded";
      eventId: ID;
      occurredAt: Date;
      taskId: ID;
      projectId: ID;
      actor?: ID | null;
      data: {
        dependencyId: ID;
      };
    }
  | {
      type: "task.dependencyRemoved";
      eventId: ID;
      occurredAt: Date;
      taskId: ID;
      projectId: ID;
      actor?: ID | null;
      data: {
        dependencyId: ID;
      };
    };

/** Task-side realtime payload (nested under {@link RealtimeMessage}). */
export type TaskRealtimeEvent =
  | {
      type: "task.created";
      taskId: ID;
      /** API-shaped task (relations included when applicable). */
      task: unknown;
    }
  | { type: "task.updated"; taskId: ID; task: unknown }
  | { type: "task.deleted"; taskId: ID }
  | {
      type: "task.statusChanged";
      taskId: ID;
      fromStatus: string;
      toStatus: string;
      actorId?: string | null;
      actorName?: string | null;
    }
  | { type: "task.dependenciesChanged"; taskId: ID; dependencyIds: ID[] };

/** Comment-side realtime payload (nested under {@link RealtimeMessage}). */
export type CommentRealtimeEvent = {
  type: "comment.created";
  taskId: ID;
  comment: unknown;
};

/** Project-side realtime payload (nested under {@link RealtimeMessage}). */
export type ProjectRealtimeEvent =
  | { type: "project.created"; project: unknown }
  | { type: "project.updated"; project: unknown }
  | { type: "project.deleted" };

/**
 * Envelope pushed to WebSocket subscribers (topic `"project"`).
 * `projectId` is always the channel key used for `subscribe`.
 */
export type RealtimeMessage =
  | { kind: "task"; projectId: ID; event: TaskRealtimeEvent }
  | { kind: "comment"; projectId: ID; event: CommentRealtimeEvent }
  | { kind: "project"; projectId: ID; event: ProjectRealtimeEvent };

