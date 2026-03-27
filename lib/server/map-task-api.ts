/**
 * Prisma uses the relation field name `assignees` on `Task` to avoid clashing with any
 * legacy DB column named `assignedTo`. The REST API and WebSocket payloads still expose
 * `assignedTo: { id, author }[]` for clients.
 */
export function mapTaskForApi<T extends { assignees?: unknown }>(task: T): Omit<T, "assignees"> & { assignedTo: unknown } {
  const { assignees, ...rest } = task;
  return {
    ...(rest as Omit<T, "assignees">),
    assignedTo: assignees ?? [],
  };
}

export function mapTasksForApi<T extends { assignees?: unknown }>(tasks: T[]) {
  return tasks.map(mapTaskForApi);
}
