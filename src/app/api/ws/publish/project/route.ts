import { publishToProject } from "../../../../../../lib/server/ws-connection-registry";

type Body = {
  projectId?: unknown;
  topic?: unknown;
  payload?: unknown;
};

/**
 * Dev/testing: send a message only to WebSocket clients subscribed to `projectId`.
 * Requires `npm run dev` / `npm start` (custom `server.ts`).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;

    if (typeof body.projectId !== "string" || body.projectId.trim().length === 0) {
      return Response.json(
        { error: "`projectId` is required (non-empty string)." },
        { status: 400 },
      );
    }
    if (typeof body.topic !== "string" || body.topic.trim().length === 0) {
      return Response.json(
        { error: "`topic` is required (non-empty string)." },
        { status: 400 },
      );
    }
    if (body.payload === undefined) {
      return Response.json(
        { error: "`payload` is required (can be null)." },
        { status: 400 },
      );
    }

    const recipients = publishToProject(
      body.projectId.trim(),
      body.topic.trim(),
      body.payload,
    );

    return Response.json({ ok: true, recipients });
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}
