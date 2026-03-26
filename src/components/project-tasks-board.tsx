"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useProjectTasks } from "@/hooks/use-project-tasks";
import { useUndoRedo } from "@/hooks/use-undo-redo";
import { fetchProjects, ProjectList } from "./project-list";
import { TaskBoard } from "./task-board";
import { TaskDetailsPanel } from "./task-details-panel";

/** Suggestions for new tasks; any non-empty string is allowed by the API. */
const CREATE_TASK_STATUS_PRESETS = [
  "todo",
  "in_progress",
  "in progress",
  "doing",
  "blocked",
  "review",
  "done",
  "completed",
] as const;

function NewTaskDraftSection({
  activeProjectId,
}: {
  activeProjectId: string | null;
}) {
  const queryClient = useQueryClient();
  const {
    present: draftTitle,
    push: pushTitle,
    replace: replaceTitle,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo("");
  const [newTaskStatus, setNewTaskStatus] = useState("todo");

  const createTask = useMutation({
    mutationFn: async (payload: {
      projectId: string;
      title: string;
      status: string;
    }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: payload.projectId,
          title: payload.title,
          status: payload.status,
        }),
      });
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
      void queryClient.invalidateQueries({ queryKey: ["tasks", variables.projectId] });
      replaceTitle("");
      setNewTaskStatus("todo");
    },
  });

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draftTitle.trim();
    const status = newTaskStatus.trim();
    if (!title || !status || !activeProjectId) return;
    createTask.mutate({
      projectId: activeProjectId,
      title,
      status,
    });
  };

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
        New task (undo/redo draft)
      </h2>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
          onClick={() => pushTitle("Design API")}
        >
          Preset: Design API
        </button>
        <button
          type="button"
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-600 dark:bg-zinc-900"
          onClick={() => pushTitle("Wire up UI")}
        >
          Preset: Wire up UI
        </button>
        <button
          type="button"
          disabled={!canUndo}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900"
          onClick={undo}
        >
          Undo
        </button>
        <button
          type="button"
          disabled={!canRedo}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900"
          onClick={redo}
        >
          Redo
        </button>
      </div>
      <form
        onSubmit={onCreate}
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label
            htmlFor="task-title"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Title
          </label>
          <input
            id="task-title"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={draftTitle}
            onChange={(e) => replaceTitle(e.target.value)}
            placeholder="Task title"
          />
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-44">
          <label
            htmlFor="task-status"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Status
          </label>
          <input
            id="task-status"
            name="status"
            list="task-status-presets"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={newTaskStatus}
            onChange={(e) => setNewTaskStatus(e.target.value)}
            placeholder="e.g. todo"
            autoComplete="off"
          />
          <datalist id="task-status-presets">
            {CREATE_TASK_STATUS_PRESETS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <button
          type="submit"
          disabled={
            !activeProjectId ||
            !draftTitle.trim() ||
            !newTaskStatus.trim() ||
            createTask.isPending
          }
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {createTask.isPending ? "Creating…" : "Create task"}
        </button>
      </form>
      {createTask.isError ? (
        <p className="text-sm text-red-600">{createTask.error.message}</p>
      ) : null}
    </section>
  );
}

function statusLabel(s: string) {
  switch (s) {
    case "idle":
      return "Realtime: idle";
    case "connecting":
      return "Realtime: connecting…";
    case "open":
      return "Realtime: connected";
    case "closed":
      return "Realtime: disconnected";
    case "error":
      return "Realtime: error";
    default:
      return "Realtime: —";
  }
}

export function ProjectTasksBoard() {
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const projectList = projectsQuery.data ?? [];
  const fallbackProjectId = projectList[0]?.id ?? null;
  const activeProjectId = projectId ?? fallbackProjectId;

  const {
    data: tasks,
    connectionStatus,
  } = useProjectTasks(activeProjectId);

  const effectiveSelectedTaskId = useMemo(() => {
    if (selectedTaskId == null || !tasks?.length) return null;
    return tasks.some((t) => t.id === selectedTaskId) ? selectedTaskId : null;
  }, [selectedTaskId, tasks]);

  return (
    <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-8 px-4 py-10 font-sans text-zinc-900 dark:text-zinc-100">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold tracking-tight">Project tasks</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Kanban board with drag-and-drop status changes, realtime task list, and a detail panel for
          dependencies and comments.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(200px,240px)_1fr_minmax(280px,360px)]">
        <aside className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Projects
          </h2>
          <ProjectList
            selectedId={activeProjectId}
            onSelect={(id) => setProjectId(id)}
          />
          <p className="text-xs text-zinc-500" aria-live="polite">
            {statusLabel(connectionStatus)}
          </p>
        </aside>

        <div className="flex min-w-0 flex-col gap-8">
          <NewTaskDraftSection
            key={activeProjectId ?? "none"}
            activeProjectId={activeProjectId}
          />

          <TaskBoard
            projectId={activeProjectId}
            selectedTaskId={effectiveSelectedTaskId}
            onSelectTask={setSelectedTaskId}
          />
        </div>

        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Details
          </h2>
          <TaskDetailsPanel
            taskId={effectiveSelectedTaskId}
            projectId={activeProjectId}
            projectTasks={tasks ?? []}
          />
        </aside>
      </div>
    </div>
  );
}
