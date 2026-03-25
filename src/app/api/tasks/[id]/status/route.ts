import { publishTaskEvent } from "../../../../../../lib/server/realtime-publish";
import { prisma } from "../../../../../../lib/server/prisma";

type ChangeStatusBody = {
  status?: unknown;
  actorId?: unknown;
  actorName?: unknown;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as ChangeStatusBody;

    if (typeof body.status !== "string" || body.status.trim().length === 0) {
      return Response.json(
        { error: "Field `status` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    const targetStatus = body.status.trim();
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
            select: { id: true, status: true },
          },
        },
      });

      if (!task) {
        throw new Error("NOT_FOUND");
      }

      const doneStatuses = new Set(["done", "completed"]);
      if (doneStatuses.has(targetStatus.toLowerCase())) {
        const blockedBy = task.dependencies.filter(
          (dependency) => !doneStatuses.has(dependency.status.toLowerCase()),
        );
        if (blockedBy.length > 0) {
          throw new Error("DEPENDENCIES_INCOMPLETE");
        }
      }

      const nextVersionRows = await tx.$queryRaw<{ nextVersion: number }[]>`
        SELECT COALESCE(MAX("version"), 0) + 1 AS "nextVersion"
        FROM "TaskEvent"
        WHERE "taskId" = ${id}
      `;
      const nextVersion = nextVersionRows[0]?.nextVersion ?? 1;

      const updatedTask = await tx.task.update({
        where: { id },
        data: { status: targetStatus },
      });

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
          ${"STATUS_CHANGED"},
          ${JSON.stringify({
            fromStatus: task.status,
            toStatus: targetStatus,
          })},
          ${nextVersion},
          ${actorId},
          ${actorName},
          ${new Date()}
        )
      `;

      return { updatedTask, previousStatus: task.status };
    });

    publishTaskEvent(updated.updatedTask.projectId, {
      type: "task.statusChanged",
      taskId: id,
      fromStatus: updated.previousStatus,
      toStatus: updated.updatedTask.status,
      actorId,
      actorName,
    });

    return Response.json(updated.updatedTask);
  } catch (error) {
    const maybeError = error as { code?: string };
    if ((error as Error).message === "DEPENDENCIES_INCOMPLETE") {
      return Response.json(
        {
          error:
            "Cannot change status to done/completed while dependencies are incomplete.",
        },
        { status: 409 },
      );
    }
    if ((error as Error).message === "NOT_FOUND" || maybeError.code === "P2025") {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    console.error("Failed to change task status", error);
    return Response.json(
      { error: "Failed to change task status" },
      { status: 500 },
    );
  }
}

