"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { memo, useEffect, useState } from "react";
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
function CommentListImpl({ taskId, projectId }: CommentListProps) {
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

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const res = await fetch(
        `/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(
          typeof j === "object" && j && "error" in j
            ? String((j as { error: string }).error)
            : `HTTP ${res.status}`,
        );
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["comments", taskId] });
    },
  });

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
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
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
                </div>
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 p-1.5 text-red-800 hover:bg-red-100 disabled:opacity-40 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-200 dark:hover:bg-red-950/80"
                  disabled={deleteComment.isPending}
                  aria-label={`Delete comment by ${c.author.author}`}
                  title="Delete comment"
                  onClick={() => {
                    if (
                      typeof window !== "undefined" &&
                      !window.confirm("Delete this comment?")
                    ) {
                      return;
                    }
                    deleteComment.mutate(c.id);
                  }}
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
                      d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>
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
      {deleteComment.isError ? (
        <p className="text-xs text-red-600">{deleteComment.error.message}</p>
      ) : null}
    </div>
  );
}

export const CommentList = memo(CommentListImpl);
