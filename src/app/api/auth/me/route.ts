import { getSessionUser } from "../../../../../lib/server/auth";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return Response.json({ user: null });
    }
    return Response.json({ user });
  } catch (error) {
    console.error("Failed to read session", error);
    return Response.json({ error: "Failed to read session" }, { status: 500 });
  }
}
