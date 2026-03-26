"use client";

import { useQuery } from "@tanstack/react-query";

export type ApiTaskDetail = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  configuration?: unknown;
  dependencies: { id: string; title: string; status: string }[];
  assignedTo: { id: string; author: string }[];
};

async function fetchTaskDetail(taskId: string): Promise<ApiTaskDetail> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      typeof err === "object" && err && "error" in err
        ? String((err as { error: string }).error)
        : `HTTP ${res.status}`,
    );
  }
  return res.json() as Promise<ApiTaskDetail>;
}

export function useTaskDetail(taskId: string | null) {
  return useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTaskDetail(taskId!),
    enabled: Boolean(taskId),
  });
}
