"use client";

import { useQuery } from "@tanstack/react-query";
import { memo } from "react";

export type ApiProject = { id: string; name: string; description?: string | null };

export async function fetchProjects(): Promise<ApiProject[]> {
  const res = await fetch("/api/projects", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load projects");
  const data = (await res.json()) as ApiProject[];
  return data;
}

type ProjectListProps = {
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  className?: string;
};

/**
 * Loads projects from `GET /api/projects` and renders a dropdown to pick one.
 */
function ProjectListImpl({ selectedId, onSelect, className = "" }: ProjectListProps) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const selectClass =
    "w-full max-w-md rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

  if (isPending) {
    return (
      <div className={`text-sm text-zinc-500 ${className}`}>Loading projects…</div>
    );
  }

  if (isError) {
    return (
      <div className={`text-sm text-red-600 ${className}`}>
        {error instanceof Error ? error.message : "Could not load projects."}
      </div>
    );
  }

  const projects = data ?? [];

  if (projects.length === 0) {
    return (
      <p className={`text-sm text-zinc-500 ${className}`}>No projects yet.</p>
    );
  }

  const value =
    selectedId && projects.some((p) => p.id === selectedId) ? selectedId : projects[0]!.id;

  return (
    <select
      className={`${selectClass} ${className}`.trim()}
      aria-label="Projects"
      value={value}
      onChange={(e) => {
        const id = e.target.value;
        if (id) onSelect(id);
      }}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export const ProjectList = memo(ProjectListImpl);
