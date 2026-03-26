import { publishProjectEvent } from "../../../../../lib/server/realtime-publish";
import { prisma } from "../../../../../lib/server/prisma";
import { Prisma } from "@/generated/prisma/client";

type UpdateProjectBody = {
  name?: unknown;
  description?: unknown;
  metadata?: unknown;
};

async function updateProject(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await request.json()) as UpdateProjectBody;

  if (
    body.name !== undefined &&
    (typeof body.name !== "string" || body.name.trim().length === 0)
  ) {
    return Response.json(
      { error: "Field `name` must be a non-empty string when provided." },
      { status: 400 },
    );
  }

  const updated = await prisma.project.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined
        ? { description: typeof body.description === "string" ? body.description : null }
        : {}),
      ...(body.metadata !== undefined
        ? {
            metadata:
              body.metadata === null
                ? Prisma.JsonNull
                : (body.metadata as Prisma.InputJsonValue),
          }
        : {}),
    },
  });

  publishProjectEvent(updated.id, { type: "project.updated", project: updated });

  return Response.json(updated);
}

function isUniqueNameError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    return Response.json(project);
  } catch (error) {
    console.error("Failed to get project", error);
    return Response.json({ error: "Failed to get project" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await updateProject(request, { params });
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    if (isUniqueNameError(error)) {
      return Response.json(
        { error: "A project with this name already exists." },
        { status: 409 },
      );
    }

    console.error("Failed to update project", error);
    return Response.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return await updateProject(request, { params });
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }
    if (isUniqueNameError(error)) {
      return Response.json(
        { error: "A project with this name already exists." },
        { status: 409 },
      );
    }

    console.error("Failed to patch project", error);
    return Response.json({ error: "Failed to patch project" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    await prisma.project.delete({
      where: { id },
    });

    publishProjectEvent(id, { type: "project.deleted" });

    return new Response(null, { status: 204 });
  } catch (error) {
    const maybeError = error as { code?: string };
    if (maybeError.code === "P2025") {
      return Response.json({ error: "Project not found" }, { status: 404 });
    }

    console.error("Failed to delete project", error);
    return Response.json({ error: "Failed to delete project" }, { status: 500 });
  }
}

