import { publishCommentEvent } from "../../../../../../../lib/server/realtime-publish";
import { prisma } from "../../../../../../../lib/server/prisma";

export async function DELETE(
  _request: Request,
  {
    params,
  }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id: taskId, commentId } = await params;

    const comment = await prisma.comment.findFirst({
      where: { id: commentId, taskId },
      include: {
        task: { select: { projectId: true } },
      },
    });

    if (!comment) {
      return Response.json({ error: "Comment not found for this task." }, { status: 404 });
    }

    await prisma.comment.delete({
      where: { id: commentId },
    });

    publishCommentEvent(comment.task.projectId, {
      type: "comment.deleted",
      taskId,
      commentId,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json({ error: "Comment not found" }, { status: 404 });
    }

    console.error("Failed to delete comment", error);
    return Response.json({ error: "Failed to delete comment" }, { status: 500 });
  }
}
