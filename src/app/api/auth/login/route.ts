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

    const user = await prisma.user.findUnique({
      where: { author: username },
      select: { id: true, author: true },
    });

    if (!user) {
      return Response.json({ error: "No account found for that username." }, { status: 404 });
    }

    await setSessionUser(user.id);

    return Response.json(mapUserForAuth(user));
  } catch (error) {
    console.error("Failed to log in", error);
    return Response.json({ error: "Failed to log in" }, { status: 500 });
  }
}
