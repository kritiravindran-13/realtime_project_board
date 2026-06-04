import { parseUsername } from "../../../../../lib/server/auth";
import { prisma } from "../../../../../lib/server/prisma";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const username = parseUsername(url.searchParams.get("username"));

    if (!username) {
      return Response.json({ available: false, valid: false });
    }

    const existing = await prisma.user.findUnique({
      where: { author: username },
      select: { id: true },
    });

    return Response.json({ available: !existing, valid: true });
  } catch (error) {
    console.error("Failed to check username", error);
    return Response.json({ error: "Failed to check username" }, { status: 500 });
  }
}
