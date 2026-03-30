"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ApiTask } from "../../lib/shared/api-task";
import { mergeTaskListFromRealtimeMessage } from "../../lib/shared/merge-task-list-from-realtime";
import { useRealtime } from "./use-realtime";

export type { ApiTask };

async function fetchProjectTasks(projectId: string): Promise<ApiTask[]> {
  const res = await fetch(
    `/api/tasks?projectId=${encodeURIComponent(projectId)}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<ApiTask[]>;
}

/**
 * TanStack Query for `GET /api/tasks?projectId=…` plus realtime invalidation / optimistic merges.
 */
export function useProjectTasks(projectId: string | null) {
  const queryClient = useQueryClient();
  const { subscribe, connectionStatus } = useRealtime(projectId);

  const query = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => fetchProjectTasks(projectId!),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (!projectId) return;
    return subscribe((msg) => {
      if (msg.kind === "project" || msg.kind === "comment") {
        void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
        return;
      }
      const prev = queryClient.getQueryData<ApiTask[]>(["tasks", projectId]);
      if (!prev) {
        void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
        return;
      }
      const merged = mergeTaskListFromRealtimeMessage(prev, msg);
      if (merged === null) {
        void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
        return;
      }
      queryClient.setQueryData(["tasks", projectId], merged);
    });
  }, [projectId, queryClient, subscribe]);

  return { ...query, connectionStatus };
}
