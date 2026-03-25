import { publishCommentEvent } from "../../../../../../lib/server/realtime-publish";
import { prisma } from "../../../../../../lib/server/prisma";

type AddCommentBody = {
  content?: unknown;
  /** Resolve or create User by display name */
  author?: unknown;
  authorId?: unknown;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const comments = await prisma.comment.findMany({
      where: { taskId: id },
      orderBy: { timestamp: "desc" },
      include: {
        author: {
          select: { id: true, author: true },
        },
      },
    });

    return Response.json(comments);
  } catch (error) {
    console.error("Failed to list comments", error);
    return Response.json({ error: "Failed to list comments" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as AddCommentBody;

    if (
      typeof body.content !== "string" ||
      body.content.trim().length === 0
    ) {
      return Response.json(
        { error: "Field `content` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    let authorId: string;
    if (typeof body.authorId === "string" && body.authorId.trim().length > 0) {
      authorId = body.authorId.trim();
      const user = await prisma.user.findUnique({ where: { id: authorId } });
      if (!user) {
        return Response.json({ error: "User not found for `authorId`." }, { status: 404 });
      }
    } else if (
      typeof body.author === "string" &&
      body.author.trim().length > 0
    ) {
      const name = body.author.trim();
      const existing = await prisma.user.findFirst({ where: { author: name } });
      const user =
        existing ??
        (await prisma.user.create({
          data: { author: name },
        }));
      authorId = user.id;
    } else {
      return Response.json(
        { error: "Provide `authorId` or non-empty `author` (display name)." },
        { status: 400 },
      );
    }

    const task = await prisma.task.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const comment = await prisma.comment.create({
      data: {
        taskId: id,
        authorId,
        content: body.content.trim(),
      },
      include: {
        author: {
          select: { id: true, author: true },
        },
      },
    });

    publishCommentEvent(task.projectId, {
      type: "comment.created",
      taskId: id,
      comment,
    });

    return Response.json(comment, { status: 201 });
  } catch (error) {
    console.error("Failed to add comment", error);
    return Response.json({ error: "Failed to add comment" }, { status: 500 });
  }
}
