import { publishProjectEvent } from "../../../../lib/server/realtime-publish";
import { prisma } from "../../../../lib/server/prisma";
import { Prisma } from "@/generated/prisma/client";

type CreateProjectBody = {
  name?: unknown;
  description?: unknown;
  metadata?: unknown;
};

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { name: "asc" },
    });

    return Response.json(projects);
  } catch (error) {
    console.error("Failed to list projects", error);
    return Response.json(
      { error: "Failed to list projects" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CreateProjectBody;

    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return Response.json(
        { error: "Field `name` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    const project = await prisma.project.create({
      data: {
        name: body.name.trim(),
        description: typeof body.description === "string" ? body.description : null,
        metadata:
          body.metadata !== undefined
            ? body.metadata === null
              ? Prisma.JsonNull
              : (body.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });

    publishProjectEvent(project.id, { type: "project.created", project });

    return Response.json(project, { status: 201 });
  } catch (error) {
    console.error("Failed to create project", error);
    return Response.json(
      { error: "Failed to create project" },
      { status: 500 },
    );
  }
}

