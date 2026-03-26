import { Prisma } from "@/generated/prisma/client";
import { publishTaskEvent } from "../../../../lib/server/realtime-publish";
import { prisma } from "../../../../lib/server/prisma";

type CreateTaskBody = {
  projectId?: unknown;
  title?: unknown;
  status?: unknown;
  /** User IDs to assign (many-to-many). Legacy alias: `assignedTo` as string[]. */
  assigneeIds?: unknown;
  assignedTo?: unknown;
  configuration?: unknown;
  dependencies?: unknown;
};

function parseAssigneeIds(body: CreateTaskBody): string[] {
  const raw = body.assigneeIds ?? body.assignedTo;
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    if (typeof projectId !== "string" || projectId.trim().length === 0) {
      return Response.json(
        { error: "Query parameter `projectId` is required." },
        { status: 400 },
      );
    }

    const tasks = await prisma.task.findMany({
      where: { projectId: projectId.trim() },
      orderBy: { id: "asc" },
      include: {
        dependencies: { select: { id: true } },
        assignedTo: { select: { id: true, author: true } },
      },
    });

    return Response.json(tasks);
  } catch (error) {
    console.error("Failed to list tasks", error);
    return Response.json({ error: "Failed to list tasks" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateTaskBody;

    if (typeof body.projectId !== "string" || body.projectId.trim().length === 0) {
      return Response.json(
        { error: "Field `projectId` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return Response.json(
        { error: "Field `title` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    if (typeof body.status !== "string" || body.status.trim().length === 0) {
      return Response.json(
        { error: "Field `status` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    const dependencyIds = Array.isArray(body.dependencies)
      ? body.dependencies.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];

    const assigneeIds = parseAssigneeIds(body);

    const created = await prisma.task.create({
      data: {
        projectId: body.projectId.trim(),
        title: body.title.trim(),
        status: body.status.trim(),
        ...(assigneeIds.length > 0
          ? {
              assignedTo: {
                connect: assigneeIds.map((id) => ({ id })),
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
        ...(dependencyIds.length > 0
          ? {
              dependencies: {
                connect: dependencyIds.map((id) => ({ id })),
              },
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

    publishTaskEvent(created.projectId, {
      type: "task.created",
      taskId: created.id,
      task: created,
    });

    return Response.json(created, { status: 201 });
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json(
        { error: "Project, assignee, or dependency task not found." },
        { status: 404 },
      );
    }

    console.error("Failed to create task", error);
    return Response.json({ error: "Failed to create task" }, { status: 500 });
  }
}
