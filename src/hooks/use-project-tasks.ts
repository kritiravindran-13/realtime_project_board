"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { RealtimeMessage } from "../../lib/shared/types";
import { useRealtime } from "./use-realtime";

export type ApiTask = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  dependencies?: { id: string }[];
  assignedTo?: { id: string; author: string }[];
};

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

function mergeTaskFromEvent(
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
      const merged = mergeTaskFromEvent(prev, msg);
      if (merged === null) {
        void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
        return;
      }
      queryClient.setQueryData(["tasks", projectId], merged);
    });
  }, [projectId, queryClient, subscribe]);

  return { ...query, connectionStatus };
}
