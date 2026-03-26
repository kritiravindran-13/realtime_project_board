import { Prisma } from "@/generated/prisma/client";
import { publishTaskEvent } from "../../../../../lib/server/realtime-publish";
import { prisma } from "../../../../../lib/server/prisma";

type UpdateTaskBody = {
  title?: unknown;
  status?: unknown;
  assigneeIds?: unknown;
  assignedTo?: unknown;
  configuration?: unknown;
};

function parseAssigneeIdsForUpdate(body: UpdateTaskBody): string[] | null | undefined {
  if (body.assigneeIds !== undefined) {
    if (!Array.isArray(body.assigneeIds)) return undefined;
    return body.assigneeIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }
  if (body.assignedTo !== undefined) {
    if (body.assignedTo === null) return null;
    if (!Array.isArray(body.assignedTo)) return undefined;
    return body.assignedTo.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  }
  return undefined;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        dependencies: { select: { id: true, title: true, status: true } },
        assignedTo: { select: { id: true, author: true } },
      },
    });

    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    return Response.json(task);
  } catch (error) {
    console.error("Failed to get task", error);
    return Response.json({ error: "Failed to get task" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as UpdateTaskBody;

    if (
      body.title !== undefined &&
      (typeof body.title !== "string" || body.title.trim().length === 0)
    ) {
      return Response.json(
        { error: "Field `title` must be a non-empty string when provided." },
        { status: 400 },
      );
    }

    if (
      body.status !== undefined &&
      (typeof body.status !== "string" || body.status.trim().length === 0)
    ) {
      return Response.json(
        { error: "Field `status` must be a non-empty string when provided." },
        { status: 400 },
      );
    }

    const assigneeIds = parseAssigneeIdsForUpdate(body);

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined ? { title: body.title.trim() } : {}),
        ...(body.status !== undefined ? { status: body.status.trim() } : {}),
        ...(assigneeIds !== undefined
          ? {
              assignedTo: {
                set:
                  assigneeIds === null
                    ? []
                    : assigneeIds.map((aid) => ({ id: aid })),
              },
            }
          : {}),
        ...(body.configuration !== undefined
          ? {
              configuration:
                body.configuration === null
                  ? Prisma.JsonNull
                  : (body.configuration as Prisma.InputJsonValue),
            }
          : {}),
      },
      include: {
        dependencies: {
          select: { id: true },
        },
        assignedTo: {
          select: { id: true, author: true },
        },
      },
    });

    publishTaskEvent(updated.projectId, {
      type: "task.updated",
      taskId: updated.id,
      task: updated,
    });

    return Response.json(updated);
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    console.error("Failed to update task", error);
    return Response.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const existing = await prisma.task.findUnique({
      where: { id },
      select: { projectId: true },
    });
    if (!existing) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.delete({
      where: { id },
    });

    publishTaskEvent(existing.projectId, {
      type: "task.deleted",
      taskId: id,
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    console.error("Failed to delete task", error);
    return Response.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
