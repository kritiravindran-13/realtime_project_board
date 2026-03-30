/**
 * API-shaped task row for list/detail responses and realtime merges.
 * Matches {@link useProjectTasks} / `GET /api/tasks`.
 */
export type ApiTask = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  dependencies?: { id: string }[];
  assignedTo?: { id: string; author: string }[];
};
