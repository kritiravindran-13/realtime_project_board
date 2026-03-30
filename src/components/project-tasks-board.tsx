"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
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

function parseAuthorsInput(input: string): string[] {
  const parts = input
    .split(/[,\n;]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(parts));
}

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
  const [newTaskAuthors, setNewTaskAuthors] = useState("");

  const createTask = useMutation({
    mutationFn: async (payload: {
      projectId: string;
      title: string;
      status: string;
      authors?: string[];
    }) => {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: payload.projectId,
          title: payload.title,
          status: payload.status,
          ...(payload.authors && payload.authors.length > 0
            ? { authors: payload.authors }
            : {}),
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
      setNewTaskAuthors("");
    },
  });

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draftTitle.trim();
    const status = newTaskStatus.trim();
    const authors = parseAuthorsInput(newTaskAuthors);
    if (!title || !status || !activeProjectId) return;
    createTask.mutate({
      projectId: activeProjectId,
      title,
      status,
      authors: authors.length > 0 ? authors : undefined,
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
          <select
            id="task-status"
            name="status"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={newTaskStatus}
            onChange={(e) => setNewTaskStatus(e.target.value)}
            aria-label="Task status"
          >
            {CREATE_TASK_STATUS_PRESETS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1 sm:w-44">
          <label
            htmlFor="task-authors"
            className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
          >
            Authors
          </label>
          <input
            id="task-authors"
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            value={newTaskAuthors}
            onChange={(e) => setNewTaskAuthors(e.target.value)}
            placeholder="e.g. Jane Doe, John Smith"
            autoComplete="off"
          />
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
  const queryClient = useQueryClient();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");

  const projectList = projectsQuery.data ?? [];
  const fallbackProjectId = projectList[0]?.id ?? null;
  const activeProjectId = projectId ?? fallbackProjectId;
  const activeProjectName =
    activeProjectId && projectList.length
      ? projectList.find((p) => p.id === activeProjectId)?.name ?? activeProjectId
      : activeProjectId;

  const createProject = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof j === "object" && j && "error" in j
            ? String((j as { error: string }).error)
            : `HTTP ${res.status}`,
        );
      }
      return res.json() as Promise<{ id: string; name: string }>;
    },
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setProjectId(project.id);
      setSelectedTaskId(null);
      setNewProjectName("");
    },
  });

  const deleteProject = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
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
    onSuccess: async (_data, id) => {
      setSelectedTaskId(null);
      // Let fallbackProjectId pick the next project after refresh.
      setProjectId(null);
      setNewProjectName("");
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.removeQueries({ queryKey: ["tasks", id] });
    },
  });

  const {
    data: tasks,
    connectionStatus,
  } = useProjectTasks(activeProjectId);

  const effectiveSelectedTaskId = useMemo(() => {
    if (selectedTaskId == null || !tasks?.length) return null;
    return tasks.some((t) => t.id === selectedTaskId) ? selectedTaskId : null;
  }, [selectedTaskId, tasks]);

  const handleSelectProject = useCallback((id: string) => {
    setProjectId(id);
  }, []);

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
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ProjectList
                selectedId={activeProjectId}
                onSelect={handleSelectProject}
                className="max-w-none"
              />
            </div>
            <button
              type="button"
              disabled={!activeProjectId || deleteProject.isPending}
              onClick={() => {
                if (!activeProjectId) return;
                if (
                  typeof window !== "undefined" &&
                  !window.confirm(
                    `Delete project \"${activeProjectName}\"? This will delete its tasks and comments.`,
                  )
                ) {
                  return;
                }
                deleteProject.mutate(activeProjectId);
              }}
              title="Delete project"
              aria-label="Delete project"
              className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 disabled:opacity-40 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-4 w-4"
                aria-hidden={true}
              >
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5-.06l.3-7.5z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <p className="text-xs text-zinc-500" aria-live="polite">
            {statusLabel(connectionStatus)}
          </p>
          {deleteProject.isError ? (
            <p className="text-xs text-red-600">{deleteProject.error.message}</p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <label
              htmlFor="new-project"
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              Create project
            </label>
            <div className="flex flex-col gap-2">
              <input
                id="new-project"
                className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                autoComplete="off"
              />
              <button
                type="button"
                disabled={!newProjectName.trim() || createProject.isPending}
                onClick={() => createProject.mutate(newProjectName.trim())}
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {createProject.isPending ? "Creating…" : "Add project"}
              </button>
            </div>
            {createProject.isError ? (
              <p className="text-xs text-red-600">{createProject.error.message}</p>
            ) : null}
          </div>
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
            onSelectTask={setSelectedTaskId}
          />
        </aside>
      </div>
    </div>
  );
}
