"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { ApiTask } from "@/hooks/use-project-tasks";
import type { ApiTaskDetail } from "@/hooks/use-task-detail";
import { useRealtime } from "@/hooks/use-realtime";
import { useTaskDetail } from "@/hooks/use-task-detail";
import { CommentList } from "./comment-list";

type TaskDetailsPanelProps = {
  taskId: string | null;
  projectId: string | null;
  /** Other tasks in the project (for picking dependencies). */
  projectTasks: ApiTask[];
};

function TaskDependenciesEditor({
  task,
  projectId,
  candidates,
}: {
  task: ApiTaskDetail;
  projectId: string;
  candidates: ApiTask[];
}) {
  const queryClient = useQueryClient();
  const taskId = task.id;
  const [ids, setIds] = useState(() => task.dependencies.map((d) => d.id));

  const saveDeps = useMutation({
    mutationFn: async (dependencyIds: string[]) => {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/dependencies`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dependencyIds }),
        },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof j === "object" && j && "error" in j
            ? String((j as { error: string }).error)
            : `HTTP ${res.status}`,
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Dependencies
      </h3>
      <p className="text-xs text-zinc-500">
        Hold Ctrl/Cmd (or Shift) to pick multiple tasks this one depends on.
      </p>
      <select
        multiple
        size={Math.min(10, Math.max(4, candidates.length))}
        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        value={ids}
        onChange={(e) => {
          setIds(Array.from(e.target.selectedOptions).map((o) => o.value));
        }}
      >
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title} ({t.status})
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={saveDeps.isPending}
        className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        onClick={() => saveDeps.mutate(ids)}
      >
        {saveDeps.isPending ? "Saving…" : "Save dependencies"}
      </button>
      {saveDeps.isError ? (
        <p className="text-xs text-red-600">{saveDeps.error.message}</p>
      ) : null}
    </div>
  );
}

/**
 * Loads a task via `GET /api/tasks/[id]`, keeps it fresh with project realtime, and hosts
 * dependency editing (`PUT /api/tasks/[id]/dependencies`) plus {@link CommentList}.
 */
export function TaskDetailsPanel({
  taskId,
  projectId,
  projectTasks,
}: TaskDetailsPanelProps) {
  const queryClient = useQueryClient();
  const { subscribe } = useRealtime(projectId);
  const detail = useTaskDetail(taskId);

  useEffect(() => {
    if (!projectId || !taskId) return;
    return subscribe((msg) => {
      if (msg.kind === "task") {
        const ev = msg.event;
        const affectedId =
          ev.type === "task.deleted"
            ? ev.taskId
            : "taskId" in ev
              ? ev.taskId
              : null;
        if (affectedId === taskId) {
          void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
        }
      }
      if (msg.kind === "comment" && msg.event.taskId === taskId) {
        void queryClient.invalidateQueries({ queryKey: ["task", taskId] });
      }
    });
  }, [projectId, taskId, subscribe, queryClient]);

  const task = detail.data;
  const candidates = projectTasks.filter((t) => t.id !== taskId);

  if (!taskId) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Select a task on the board to view details, dependencies, and comments.
      </div>
    );
  }

  if (detail.isPending) {
    return (
      <div className="rounded-xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800">
        Loading task…
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
        {detail.error.message}
      </div>
    );
  }

  if (!task || !projectId) return null;

  const depKey = task.dependencies.map((d) => d.id).sort().join(",");

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div>
        <h2 className="text-lg font-semibold leading-snug">{task.title}</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Status: <span className="font-medium text-zinc-700 dark:text-zinc-300">{task.status}</span>
        </p>
        {task.assignedTo && task.assignedTo.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500">
            Assigned:{" "}
            {task.assignedTo.map((u) => u.author).join(", ")}
          </p>
        ) : null}
      </div>

      <TaskDependenciesEditor
        key={`${task.id}-${depKey}`}
        task={task}
        projectId={projectId}
        candidates={candidates}
      />

      <CommentList taskId={taskId} projectId={projectId} />
    </div>
  );
}
