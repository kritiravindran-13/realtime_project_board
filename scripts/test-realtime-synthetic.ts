/**
 * Verifies a hand-built {@link RealtimeMessage} is delivered when published via
 * `POST /api/ws/publish/project` (same path as `publishRealtimeMessage` uses internally).
 *
 * Run via `npm run test:realtime` or `npm run test:realtime:synthetic`.
 */

import WebSocket from "ws";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { RealtimeMessage } from "../lib/shared/types";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  REALTIME_TOPIC,
  expectRealtime,
  fail,
  fetchJson,
  httpToWs,
  isRecord,
  makeJsonStream,
} from "./realtime-test-utils";

export async function runSyntheticRealtimePublishE2e(
  baseUrl: string = DEFAULT_BASE_URL,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const origin = new URL(baseUrl).origin;
  const wsUrl = `${httpToWs(origin)}/api/ws`;

  console.log(`Base: ${origin}`);

  const projectName = `Synthetic realtime E2E ${Date.now()}`;

  const proj = await fetchJson(baseUrl, "POST", "/api/projects", {
    name: projectName,
    description: "scripts/test-realtime-synthetic.ts",
  });
  if (!proj.ok || !isRecord(proj.data) || typeof proj.data.id !== "string") {
    fail(`POST /api/projects -> ${proj.status}: ${JSON.stringify(proj.data)}`);
  }
  const projectId = proj.data.id;
  console.log(`Project: ${projectId}`);

  const syntheticTaskId = "synthetic-task-e2e";
  const realtimeMessage: RealtimeMessage = {
    kind: "task",
    projectId,
    event: {
      type: "task.updated",
      taskId: syntheticTaskId,
      task: {
        note: "synthetic payload from test-realtime-synthetic.ts",
        sentAt: new Date().toISOString(),
      },
    },
  };

  const ws = new WebSocket(wsUrl);
  const stream = makeJsonStream(ws);

  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (e) => reject(e));
  });

  const welcome = await stream.next(timeoutMs);
  if (!isRecord(welcome) || welcome.type !== "welcome") {
    fail(`Expected welcome, got: ${JSON.stringify(welcome)}`);
  }
  console.log("OK  welcome");

  ws.send(JSON.stringify({ type: "subscribe", projectId }));
  const sub = await stream.next(timeoutMs);
  if (!isRecord(sub) || sub.type !== "subscribed") {
    fail(`Expected subscribed, got: ${JSON.stringify(sub)}`);
  }
  console.log("OK  subscribed");

  const pub = await fetchJson(baseUrl, "POST", "/api/ws/publish/project", {
    projectId,
    topic: REALTIME_TOPIC,
    payload: realtimeMessage,
  });
  if (!pub.ok || !isRecord(pub.data) || pub.data.recipients !== 1) {
    fail(`POST /api/ws/publish/project -> ${pub.status}: ${JSON.stringify(pub.data)}`);
  }
  console.log("OK  HTTP publish recipients=1");

  const { projectId: pid, event } = await expectRealtime(
    stream,
    "task",
    "task.updated",
    timeoutMs,
  );
  if (pid !== projectId || event.taskId !== syntheticTaskId) {
    fail(`Synthetic frame mismatch: ${JSON.stringify({ pid, event })}`);
  }
  const task = event.task;
  if (!isRecord(task) || task.note !== "synthetic payload from test-realtime-synthetic.ts") {
    fail(`Synthetic task payload: ${JSON.stringify(task)}`);
  }
  console.log("OK  WS received synthetic RealtimeMessage");

  ws.close();
  console.log("Synthetic realtime publish checks passed.");
}

const thisFile = resolve(fileURLToPath(import.meta.url));
const invokedAsMain = Boolean(process.argv[1] && resolve(process.argv[1]) === thisFile);

if (invokedAsMain) {
  void runSyntheticRealtimePublishE2e().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
