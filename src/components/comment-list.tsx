"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRealtime } from "@/hooks/use-realtime";

export type ApiComment = {
  id: string;
  taskId: string;
  content: string;
  authorId: string;
  timestamp: string;
  author: { id: string; author: string };
};

async function fetchComments(taskId: string): Promise<ApiComment[]> {
  const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
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
  return res.json() as Promise<ApiComment[]>;
}

type CommentListProps = {
  taskId: string;
  projectId: string | null;
};

/**
 * Lists comments from `GET /api/tasks/[id]/comments`, supports posting, and refreshes on realtime `comment` events.
 */
export function CommentList({ taskId, projectId }: CommentListProps) {
  const queryClient = useQueryClient();
  const { subscribe } = useRealtime(projectId);

  const query = useQuery({
    queryKey: ["comments", taskId],
    queryFn: () => fetchComments(taskId),
    enabled: Boolean(taskId),
  });

  useEffect(() => {
    if (!projectId || !taskId) return;
    return subscribe((msg) => {
      if (msg.kind !== "comment") return;
      if (msg.event.taskId === taskId) {
        void queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
      }
    });
  }, [projectId, taskId, subscribe, queryClient]);

  const [author, setAuthor] = useState("");
  const [content, setContent] = useState("");

  const postComment = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: author.trim() || "Anonymous",
          content: content.trim(),
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
    onSuccess: () => {
      setContent("");
      void queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
    },
  });

  if (!taskId) return null;

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Comments
      </h3>
      {query.isPending ? (
        <p className="text-sm text-zinc-500">Loading comments…</p>
      ) : query.isError ? (
        <p className="text-sm text-red-600">
          {query.error instanceof Error ? query.error.message : "Failed to load"}
        </p>
      ) : !query.data?.length ? (
        <p className="text-sm text-zinc-500">No comments yet.</p>
      ) : (
        <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto text-sm">
          {query.data.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <p className="text-xs text-zinc-500">
                {c.author.author} ·{" "}
                {new Date(c.timestamp).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                {c.content}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800"
        onSubmit={(e) => {
          e.preventDefault();
          if (!content.trim()) return;
          postComment.mutate();
        }}
      >
        <input
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="Your name (optional)"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
        />
        <textarea
          className="min-h-[72px] rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-950"
          placeholder="Write a comment…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <button
          type="submit"
          disabled={!content.trim() || postComment.isPending}
          className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 dark:bg-zinc-200 dark:text-zinc-900"
        >
          {postComment.isPending ? "Posting…" : "Post comment"}
        </button>
        {postComment.isError ? (
          <p className="text-xs text-red-600">{postComment.error.message}</p>
        ) : null}
      </form>
    </div>
  );
}
