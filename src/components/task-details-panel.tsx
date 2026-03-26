"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ApiTask } from "@/hooks/use-project-tasks";
import type { ApiTaskDetail } from "@/hooks/use-task-detail";
import { useRealtime } from "@/hooks/use-realtime";
import { useTaskDetail } from "@/hooks/use-task-detail";
import { CommentList } from "./comment-list";

const STATUS_PRESETS = [
  "todo",
  "in_progress",
  "in progress",
  "doing",
  "blocked",
  "review",
  "done",
  "completed",
] as const;

function statusOptionsForProject(tasks: ApiTask[], current: string): string[] {
  const set = new Set<string>(STATUS_PRESETS);
  for (const t of tasks) set.add(t.status);
  set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

type TaskDetailsPanelProps = {
  taskId: string | null;
  projectId: string | null;
  /** Other tasks in the project (for picking dependencies). */
  projectTasks: ApiTask[];
  /** Called when user clicks a dependency chip. */
  onSelectTask: (taskId: string | null) => void;
};

function TaskDependenciesEditor({
  task,
  projectId,
  candidates,
  onSelectTask,
}: {
  task: ApiTaskDetail;
  projectId: string;
  candidates: ApiTask[];
  onSelectTask: (taskId: string | null) => void;
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
      <div className="flex flex-wrap gap-1">
        {task.dependencies.length === 0 ? (
          <span className="text-xs text-zinc-500">No dependencies.</span>
        ) : (
          task.dependencies.map((d) => (
            <button
              key={d.id}
              className="rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              title={d.id}
              type="button"
              onClick={() => onSelectTask(d.id)}
            >
              {d.title} ({d.status})
            </button>
          ))
        )}
      </div>
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

function TaskStatusSection({
  task,
  projectId,
  projectTasks,
}: {
  task: ApiTaskDetail;
  projectId: string;
  projectTasks: ApiTask[];
}) {
  const queryClient = useQueryClient();
  const [customDraft, setCustomDraft] = useState("");

  const options = useMemo(
    () => statusOptionsForProject(projectTasks, task.status),
    [projectTasks, task.status],
  );

  const patchStatus = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(task.id)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
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
      void queryClient.invalidateQueries({ queryKey: ["task", task.id] });
      void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      setCustomDraft("");
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Status
      </h3>
      <select
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
        aria-label="Task status"
        value={task.status}
        disabled={patchStatus.isPending}
        onChange={(e) => {
          const next = e.target.value;
          if (next && next !== task.status) {
            patchStatus.mutate(next);
          }
        }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const s = customDraft.trim();
          if (!s || s === task.status) return;
          patchStatus.mutate(s);
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label
            htmlFor={`task-status-custom-${task.id}`}
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Custom status
          </label>
          <input
            id={`task-status-custom-${task.id}`}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={customDraft}
            onChange={(e) => setCustomDraft(e.target.value)}
            placeholder="e.g. in_qa"
            list={`task-detail-status-suggestions-${task.id}`}
          />
          <datalist id={`task-detail-status-suggestions-${task.id}`}>
            {options.map((opt) => (
              <option key={opt} value={opt} />
            ))}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={
            !customDraft.trim() ||
            customDraft.trim() === task.status ||
            patchStatus.isPending
          }
          className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
        >
          Apply
        </button>
      </form>
      {patchStatus.isError ? (
        <p className="text-xs text-red-600">{patchStatus.error.message}</p>
      ) : null}
      {patchStatus.isPending ? (
        <p className="text-xs text-zinc-500">Updating status…</p>
      ) : null}
    </div>
  );
}

function TaskDeleteSection({
  taskId,
  projectId,
  title,
}: {
  taskId: string;
  projectId: string;
  title: string;
}) {
  const queryClient = useQueryClient();

  const deleteTask = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof j === "object" && j && "error" in j
            ? String((j as { error: string }).error)
            : `HTTP ${res.status}`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks", projectId] });
      void queryClient.removeQueries({ queryKey: ["task", taskId] });
      void queryClient.removeQueries({ queryKey: ["comments", taskId] });
    },
  });

  return (
    <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <button
        type="button"
        className="w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800 hover:bg-red-100 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
        disabled={deleteTask.isPending}
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            !window.confirm(`Delete task "${title}"? This cannot be undone.`)
          ) {
            return;
          }
          deleteTask.mutate();
        }}
      >
        {deleteTask.isPending ? "Deleting…" : "Delete task"}
      </button>
      {deleteTask.isError ? (
        <p className="mt-2 text-xs text-red-600">{deleteTask.error.message}</p>
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
  onSelectTask,
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
        {task.assignedTo && task.assignedTo.length > 0 ? (
          <p className="mt-1 text-xs text-zinc-500">
            Assigned:{" "}
            {task.assignedTo.map((u) => u.author).join(", ")}
          </p>
        ) : null}
      </div>

      <TaskStatusSection
        task={task}
        projectId={projectId}
        projectTasks={projectTasks}
      />

      <TaskDependenciesEditor
        key={`${task.id}-${depKey}`}
        task={task}
        projectId={projectId}
        candidates={candidates}
        onSelectTask={onSelectTask}
      />

      <TaskDeleteSection
        taskId={task.id}
        projectId={projectId}
        title={task.title}
      />

      <CommentList taskId={taskId} projectId={projectId} />
    </div>
  );
}
