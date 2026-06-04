import { clearSessionUser } from "../../../../../lib/server/auth";

export async function POST() {
  try {
    await clearSessionUser();
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to log out", error);
    return Response.json({ error: "Failed to log out" }, { status: 500 });
  }
}
