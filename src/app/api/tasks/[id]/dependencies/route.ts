import { publishTaskEvent } from "../../../../../../lib/server/realtime-publish";
import { prisma } from "../../../../../../lib/server/prisma";

type SetDependenciesBody = {
  dependencyIds?: unknown;
  actorId?: unknown;
  actorName?: unknown;
};

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as SetDependenciesBody;

    if (!Array.isArray(body.dependencyIds)) {
      return Response.json(
        { error: "Field `dependencyIds` is required and must be an array of task IDs." },
        { status: 400 },
      );
    }

    const dependencyIds = body.dependencyIds.filter(
      (dependencyId): dependencyId is string =>
        typeof dependencyId === "string" && dependencyId.trim().length > 0,
    );

    if (dependencyIds.some((dependencyId) => dependencyId === id)) {
      return Response.json(
        { error: "A task cannot depend on itself." },
        { status: 400 },
      );
    }

    const uniqueDependencyIds = [...new Set(dependencyIds)];
    const actorId = typeof body.actorId === "string" && body.actorId.trim().length > 0
      ? body.actorId.trim()
      : null;
    const actorName = typeof body.actorName === "string" && body.actorName.trim().length > 0
      ? body.actorName.trim()
      : null;

    const updated = await prisma.$transaction(async (tx) => {
      const task = await tx.task.findUnique({
        where: { id },
        include: {
          dependencies: {
            select: { id: true },
          },
        },
      });

      if (!task) {
        throw new Error("NOT_FOUND");
      }

      const existingDependencyCount = uniqueDependencyIds.length
        ? await tx.task.count({
            where: {
              id: { in: uniqueDependencyIds },
            },
          })
        : 0;

      if (existingDependencyCount !== uniqueDependencyIds.length) {
        throw new Error("DEPENDENCY_NOT_FOUND");
      }

      const nextVersionRows = await tx.$queryRaw<{ nextVersion: number }[]>`
        SELECT COALESCE(MAX("version"), 0) + 1 AS "nextVersion"
        FROM "TaskEvent"
        WHERE "taskId" = ${id}
      `;
      const nextVersion = nextVersionRows[0]?.nextVersion ?? 1;

      const updatedTask = await tx.task.update({
        where: { id },
        data: {
          dependencies: {
            set: uniqueDependencyIds.map((dependencyId) => ({ id: dependencyId })),
          },
        },
        include: {
          dependencies: {
            select: { id: true, title: true, status: true },
          },
        },
      });

      const previousDependencyIds = task.dependencies.map((dependency) => dependency.id);
      await tx.$executeRaw`
        INSERT INTO "TaskEvent" (
          "id",
          "taskId",
          "projectId",
          "type",
          "payload",
          "version",
          "actorId",
          "actorName",
          "createdAt"
        )
        VALUES (
          ${crypto.randomUUID()},
          ${id},
          ${task.projectId},
          ${"DEPENDENCIES_CHANGED"},
          ${JSON.stringify({
            fromDependencyIds: previousDependencyIds,
            toDependencyIds: uniqueDependencyIds,
          })},
          ${nextVersion},
          ${actorId},
          ${actorName},
          ${new Date()}
        )
      `;

      return { updatedTask, dependencyIds: uniqueDependencyIds };
    });

    publishTaskEvent(updated.updatedTask.projectId, {
      type: "task.dependenciesChanged",
      taskId: id,
      dependencyIds: updated.dependencyIds,
    });

    return Response.json(updated.updatedTask);
  } catch (error) {
    const maybeError = error as { code?: string };
    if ((error as Error).message === "DEPENDENCY_NOT_FOUND") {
      return Response.json(
        { error: "One or more dependency tasks were not found." },
        { status: 404 },
      );
    }
    if ((error as Error).message === "NOT_FOUND") {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }
    if (maybeError.code === "P2025") {
      return Response.json(
        { error: "Task or one of the dependency tasks was not found." },
        { status: 404 },
      );
    }

    console.error("Failed to set task dependencies", error);
    return Response.json(
      { error: "Failed to set task dependencies" },
      { status: 500 },
    );
  }
}

