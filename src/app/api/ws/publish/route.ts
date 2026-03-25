import { publish } from "../../../../../lib/server/ws-registry";

type PublishBody = {
  topic?: unknown;
  payload?: unknown;
};

/**
 * HTTP publisher: pushes a message to all /api/ws subscribers.
 * Only works when the app is started via `server.ts` (custom Node server).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PublishBody;

    if (typeof body.topic !== "string" || body.topic.trim().length === 0) {
      return Response.json(
        { error: "Field `topic` is required and must be a non-empty string." },
        { status: 400 },
      );
    }

    if (body.payload === undefined) {
      return Response.json(
        { error: "Field `payload` is required (can be null)." },
        { status: 400 },
      );
    }

    const recipients = publish(body.topic.trim(), body.payload);

    return Response.json({ ok: true, recipients });
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
}
