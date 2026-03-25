/**
 * End-to-end: REST mutations trigger WebSocket `project` topic frames
 * (`RealtimeMessage` from `publishTaskEvent` / `publishCommentEvent` / `publishProjectEvent`).
 *
 * Requires: `npm run dev` (custom server.ts + DB).
 *
 * Usage:
 *   npm run test:broadcast
 *   npm run test:realtime   (also runs synthetic publish; see scripts/test-realtime.ts)
 */

import WebSocket from "ws";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  expectRealtime,
  fail,
  fetchJson,
  httpToWs,
  isRecord,
  makeJsonStream,
} from "./realtime-test-utils";

export async function runMutationRealtimeE2e(
  baseUrl: string = DEFAULT_BASE_URL,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const origin = new URL(baseUrl).origin;
  const wsUrl = `${httpToWs(origin)}/api/ws`;

  console.log(`Base: ${origin}`);
  console.log(`WS:   ${wsUrl}`);

  const proj = await fetchJson(baseUrl, "POST", "/api/projects", {
    name: "Broadcast E2E",
    description: "scripts/test-project-broadcast.ts",
  });
  if (!proj.ok || !isRecord(proj.data) || typeof proj.data.id !== "string") {
    fail(`POST /api/projects -> ${proj.status}: ${JSON.stringify(proj.data)}`);
  }
  const projectId = proj.data.id;
  console.log(`Project: ${projectId}`);

  const ws = new WebSocket(wsUrl);
  const stream = makeJsonStream(ws);

  await new Promise<void>((resolveOpen, reject) => {
    ws.once("open", () => resolveOpen());
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

  const patchProj = await fetchJson(baseUrl, "PATCH", `/api/projects/${projectId}`, {
    name: "Broadcast E2E (patched)",
  });
  if (!patchProj.ok) {
    fail(`PATCH project -> ${patchProj.status}: ${JSON.stringify(patchProj.data)}`);
  }
  {
    const { projectId: pid, event } = await expectRealtime(
      stream,
      "project",
      "project.updated",
      timeoutMs,
    );
    if (pid !== projectId) {
      fail(`project.updated projectId mismatch: ${JSON.stringify({ pid, projectId })}`);
    }
    const projRow = event.project;
    if (!isRecord(projRow) || projRow.name !== "Broadcast E2E (patched)") {
      fail(`project.updated.project: ${JSON.stringify(projRow)}`);
    }
    console.log("OK  broadcast project.updated");
  }

  const created1 = await fetchJson(baseUrl, "POST", "/api/tasks", {
    projectId,
    title: "Task A",
    status: "todo",
  });
  if (!created1.ok || !isRecord(created1.data) || typeof created1.data.id !== "string") {
    fail(`POST task A -> ${created1.status}: ${JSON.stringify(created1.data)}`);
  }
  const taskAId = created1.data.id as string;
  {
    const { projectId: pid, event } = await expectRealtime(
      stream,
      "task",
      "task.created",
      timeoutMs,
    );
    if (pid !== projectId || event.taskId !== taskAId) {
      fail(`task.created ids mismatch: ${JSON.stringify({ pid, event })}`);
    }
    console.log("OK  broadcast task.created");
  }

  const patched = await fetchJson(baseUrl, "PATCH", `/api/tasks/${taskAId}`, {
    title: "Task A renamed",
  });
  if (!patched.ok) {
    fail(`PATCH task -> ${patched.status}: ${JSON.stringify(patched.data)}`);
  }
  {
    const { event } = await expectRealtime(stream, "task", "task.updated", timeoutMs);
    if (event.taskId !== taskAId) fail(`task.updated taskId: ${JSON.stringify(event)}`);
    console.log("OK  broadcast task.updated");
  }

  const statusRes = await fetchJson(baseUrl, "PATCH", `/api/tasks/${taskAId}/status`, {
    status: "in_progress",
    actorName: "e2e-script",
  });
  if (!statusRes.ok) {
    fail(`PATCH status -> ${statusRes.status}: ${JSON.stringify(statusRes.data)}`);
  }
  {
    const { event } = await expectRealtime(stream, "task", "task.statusChanged", timeoutMs);
    if (event.taskId !== taskAId || event.toStatus !== "in_progress") {
      fail(`task.statusChanged: ${JSON.stringify(event)}`);
    }
    console.log("OK  broadcast task.statusChanged");
  }

  const created2 = await fetchJson(baseUrl, "POST", "/api/tasks", {
    projectId,
    title: "Task B",
    status: "todo",
  });
  if (!created2.ok || !isRecord(created2.data) || typeof created2.data.id !== "string") {
    fail(`POST task B -> ${created2.status}: ${JSON.stringify(created2.data)}`);
  }
  const taskBId = created2.data.id as string;
  {
    const { event } = await expectRealtime(stream, "task", "task.created", timeoutMs);
    if (event.taskId !== taskBId) fail(`second task.created: ${JSON.stringify(event)}`);
    console.log("OK  broadcast task.created (B)");
  }

  const depPut = await fetchJson(baseUrl, "PUT", `/api/tasks/${taskAId}/dependencies`, {
    dependencyIds: [taskBId],
    actorName: "e2e-script",
  });
  if (!depPut.ok) {
    fail(`PUT dependencies -> ${depPut.status}: ${JSON.stringify(depPut.data)}`);
  }
  {
    const { event } = await expectRealtime(
      stream,
      "task",
      "task.dependenciesChanged",
      timeoutMs,
    );
    if (event.taskId !== taskAId || !Array.isArray(event.dependencyIds)) {
      fail(`task.dependenciesChanged: ${JSON.stringify(event)}`);
    }
    const depIds = event.dependencyIds as unknown[];
    if (depIds.length !== 1 || depIds[0] !== taskBId) {
      fail(`dependencyIds expected [${taskBId}], got ${JSON.stringify(depIds)}`);
    }
    console.log("OK  broadcast task.dependenciesChanged");
  }

  const commentRes = await fetchJson(baseUrl, "POST", `/api/tasks/${taskAId}/comments`, {
    content: "hello broadcast",
    author: "E2E Commenter",
  });
  if (!commentRes.ok) {
    fail(`POST comment -> ${commentRes.status}: ${JSON.stringify(commentRes.data)}`);
  }
  {
    const { projectId: pid, event } = await expectRealtime(
      stream,
      "comment",
      "comment.created",
      timeoutMs,
    );
    if (pid !== projectId || event.taskId !== taskAId) {
      fail(`comment.created: ${JSON.stringify(event)}`);
    }
    const comment = event.comment;
    if (!isRecord(comment) || comment.content !== "hello broadcast") {
      fail(`comment.created.comment: ${JSON.stringify(comment)}`);
    }
    console.log("OK  broadcast comment.created");
  }

  const depClear = await fetchJson(baseUrl, "PUT", `/api/tasks/${taskAId}/dependencies`, {
    dependencyIds: [],
    actorName: "e2e-script",
  });
  if (!depClear.ok) {
    fail(`PUT dependencies clear -> ${depClear.status}: ${JSON.stringify(depClear.data)}`);
  }
  {
    const { event } = await expectRealtime(
      stream,
      "task",
      "task.dependenciesChanged",
      timeoutMs,
    );
    if (!Array.isArray(event.dependencyIds) || event.dependencyIds.length !== 0) {
      fail(`expected empty dependencyIds: ${JSON.stringify(event)}`);
    }
    console.log("OK  broadcast task.dependenciesChanged (clear)");
  }

  const delB = await fetchJson(baseUrl, "DELETE", `/api/tasks/${taskBId}`);
  if (!delB.ok && delB.status !== 204) {
    fail(`DELETE task B -> ${delB.status}`);
  }
  {
    const { projectId: pid, event } = await expectRealtime(stream, "task", "task.deleted", timeoutMs);
    if (pid !== projectId || event.taskId !== taskBId) {
      fail(`task.deleted: ${JSON.stringify(event)}`);
    }
    console.log("OK  broadcast task.deleted");
  }

  const delA = await fetchJson(baseUrl, "DELETE", `/api/tasks/${taskAId}`);
  if (!delA.ok && delA.status !== 204) {
    fail(`DELETE task A -> ${delA.status}`);
  }
  {
    const { event } = await expectRealtime(stream, "task", "task.deleted", timeoutMs);
    if (event.taskId !== taskAId) fail(`task.deleted A: ${JSON.stringify(event)}`);
    console.log("OK  broadcast task.deleted (A)");
  }

  ws.close();
  console.log("\nAll mutation-driven realtime checks passed.");
}

const thisFile = resolve(fileURLToPath(import.meta.url));
const invokedAsMain = Boolean(process.argv[1] && resolve(process.argv[1]) === thisFile);

if (invokedAsMain) {
  void runMutationRealtimeE2e().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
