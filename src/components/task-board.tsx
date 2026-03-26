"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import type { ApiTask } from "@/hooks/use-project-tasks";
import { useProjectTasks } from "@/hooks/use-project-tasks";

const PREFERRED_STATUS_ORDER = [
  "todo",
  "in_progress",
  "in progress",
  "doing",
  "blocked",
  "review",
  "done",
  "completed",
];

/** Above this count per status column, task cards are virtualized for scroll performance. */
export const COLUMN_VIRTUALIZE_THRESHOLD = 50;

function compareStatusColumns(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const ia = PREFERRED_STATUS_ORDER.indexOf(la);
  const ib = PREFERRED_STATUS_ORDER.indexOf(lb);
  if (ia !== -1 && ib !== -1) return ia - ib;
  if (ia !== -1) return -1;
  if (ib !== -1) return 1;
  return a.localeCompare(b);
}

function groupTasksByStatus(tasks: ApiTask[]): Map<string, ApiTask[]> {
  const map = new Map<string, ApiTask[]>();
  for (const t of tasks) {
    const key = t.status;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.title.localeCompare(b.title));
  }
  return map;
}

function TaskCard({
  task,
  selected,
  onToggleSelect,
}: {
  task: ApiTask;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={onToggleSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleSelect();
        }
      }}
      className={`w-full cursor-grab rounded-lg border px-3 py-2 text-left text-sm outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-zinc-400 ${
        selected
          ? "border-zinc-900 bg-white ring-2 ring-zinc-900 dark:border-zinc-100 dark:bg-zinc-950 dark:ring-zinc-100"
          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600"
      }`}
    >
      <span className="line-clamp-2 font-medium">{task.title}</span>
      {task.dependencies && task.dependencies.length > 0 ? (
        <span className="mt-1 block text-[10px] text-zinc-500">
          {task.dependencies.length} dependenc
          {task.dependencies.length === 1 ? "y" : "ies"}
        </span>
      ) : null}
    </div>
  );
}

function VirtualizedTaskColumn({
  columnTasks,
  selectedTaskId,
  onSelectTask,
}: {
  columnTasks: ApiTask[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  // TanStack Virtual’s API is intentionally incompatible with React Compiler memoization here.
  // eslint-disable-next-line react-hooks/incompatible-library -- windowed list only
  const virtualizer = useVirtualizer({
    count: columnTasks.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 8,
  });

  return (
    <div
      ref={parentRef}
      className="min-h-[120px] max-h-[min(70vh,520px)] overflow-y-auto overscroll-y-contain p-2"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((v) => {
          const task = columnTasks[v.index];
          if (!task) return null;
          return (
            <div
              key={task.id}
              data-index={v.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full pb-2"
              style={{ transform: `translateY(${v.start}px)` }}
            >
              <TaskCard
                task={task}
                selected={selectedTaskId === task.id}
                onToggleSelect={() =>
                  onSelectTask(
                    selectedTaskId === task.id ? null : task.id,
                  )
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type TaskBoardProps = {
  projectId: string | null;
  selectedTaskId: string | null;
  onSelectTask: (taskId: string | null) => void;
};

/**
 * Kanban-style columns by status, backed by `useProjectTasks`. Drag a card onto another column to
 * `PATCH /api/tasks/[id]/status`. Columns with more than {@link COLUMN_VIRTUALIZE_THRESHOLD} tasks
 * use windowed rendering so long lists stay scrollable and fast.
 */
export function TaskBoard({
  projectId,
  selectedTaskId,
  onSelectTask,
}: TaskBoardProps) {
  const queryClient = useQueryClient();
  const {
    data: tasks,
    isPending,
    isError,
    error,
    refetch,
    connectionStatus,
  } = useProjectTasks(projectId);

  const [statusError, setStatusError] = useState<string | null>(null);

  const patchStatus = useMutation({
    mutationFn: async (args: {
      taskId: string;
      status: string;
      projectId: string;
    }) => {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(args.taskId)}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: args.status }),
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
    onSuccess: (_data, variables) => {
      setStatusError(null);
      void queryClient.invalidateQueries({ queryKey: ["tasks", variables.projectId] });
    },
    onError: (err: Error) => {
      setStatusError(err.message);
    },
  });

  const columns = useMemo(() => {
    if (!tasks?.length) return [];
    const map = groupTasksByStatus(tasks);
    return [...map.keys()].sort(compareStatusColumns);
  }, [tasks]);

  const onDropOnStatus = useCallback(
    (taskId: string, newStatus: string) => {
      if (!projectId) return;
      const task = tasks?.find((t) => t.id === taskId);
      if (!task || task.status === newStatus) return;
      patchStatus.mutate({ taskId, status: newStatus, projectId });
    },
    [projectId, tasks, patchStatus],
  );

  if (!projectId) {
    return (
      <p className="text-sm text-zinc-500">Select a project to view the task board.</p>
    );
  }

  if (isPending) {
    return <p className="text-sm text-zinc-500">Loading tasks…</p>;
  }

  if (isError) {
    return (
      <p className="text-sm text-red-600">
        {error instanceof Error ? error.message : "Failed to load tasks"}
      </p>
    );
  }

  const map = groupTasksByStatus(tasks ?? []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Board
        </h2>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span aria-live="polite">
            {connectionStatus === "open"
              ? "Live updates on"
              : connectionStatus === "connecting"
                ? "Connecting…"
                : "Live updates off"}
          </span>
          <button
            type="button"
            className="underline"
            onClick={() => void refetch()}
          >
            Refresh
          </button>
        </div>
      </div>

      {!tasks?.length ? (
        <p className="text-sm text-zinc-500">No tasks yet. Create one above.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((status) => {
            const columnTasks = map.get(status) ?? [];
            const virtualized = columnTasks.length > COLUMN_VIRTUALIZE_THRESHOLD;

            return (
              <div
                key={status}
                className="flex w-56 shrink-0 flex-col rounded-xl border border-zinc-200 bg-zinc-50/80 dark:border-zinc-800 dark:bg-zinc-900/40"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const taskId = e.dataTransfer.getData("text/plain");
                  if (taskId) onDropOnStatus(taskId, status);
                }}
              >
                <div className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                  {status}
                  <span className="ml-1 font-normal text-zinc-400">
                    ({columnTasks.length})
                  </span>
                </div>
                {virtualized ? (
                  <VirtualizedTaskColumn
                    columnTasks={columnTasks}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                  />
                ) : (
                  <ul className="flex min-h-[120px] flex-col gap-2 p-2">
                    {columnTasks.map((task) => (
                      <li key={task.id}>
                        <TaskCard
                          task={task}
                          selected={selectedTaskId === task.id}
                          onToggleSelect={() =>
                            onSelectTask(
                              selectedTaskId === task.id ? null : task.id,
                            )
                          }
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {statusError ? (
        <p className="text-sm text-red-600" role="alert">
          {statusError}
        </p>
      ) : null}
      {patchStatus.isPending ? (
        <p className="text-xs text-zinc-500">Updating status…</p>
      ) : null}
    </div>
  );
}
