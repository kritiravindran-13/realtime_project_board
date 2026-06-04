import type { AuthBody } from "../../../../../lib/shared/auth-user";
import {
  mapUserForAuth,
  parseUsername,
  setSessionUser,
} from "../../../../../lib/server/auth";
import { prisma } from "../../../../../lib/server/prisma";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AuthBody;
    const username = parseUsername(body.username);

    if (!username) {
      return Response.json(
        {
          error:
            "Field `username` is required: 2–32 characters, letters, numbers, `_`, or `-` only.",
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.create({
      data: { author: username },
      select: { id: true, author: true },
    });

    await setSessionUser(user.id);

    return Response.json(mapUserForAuth(user), { status: 201 });
  } catch (error) {
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      return Response.json(
        { error: "That username is already taken." },
        { status: 409 },
      );
    }

    console.error("Failed to register user", error);
    return Response.json({ error: "Failed to create account" }, { status: 500 });
  }
}
