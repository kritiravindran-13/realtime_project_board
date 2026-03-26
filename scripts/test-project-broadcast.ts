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

  const projectName = `Broadcast E2E ${Date.now()}`;
  const patchedProjectName = `${projectName} (patched)`;

  const proj = await fetchJson(baseUrl, "POST", "/api/projects", {
    name: projectName,
    description: "scripts/test-project-broadcast.ts",
  });
  if (!proj.ok || !isRecord(proj.data) || typeof proj.data.id !== "string") {
    fail(`POST /api/projects -> ${proj.status}: ${JSON.stringify(proj.data)}`);
  }
  const projectId = proj.data.id;
  console.log(`Project: ${projectId}`);

  // Open TWO websocket clients to verify all subscribers receive the same sequence.
  const ws1 = new WebSocket(wsUrl);
  const stream1 = makeJsonStream(ws1);
  const ws2 = new WebSocket(wsUrl);
  const stream2 = makeJsonStream(ws2);

  await Promise.all([
    new Promise<void>((resolveOpen, reject) => {
      ws1.once("open", () => resolveOpen());
      ws1.once("error", (e) => reject(e));
    }),
    new Promise<void>((resolveOpen, reject) => {
      ws2.once("open", () => resolveOpen());
      ws2.once("error", (e) => reject(e));
    }),
  ]);

  const welcome1 = await stream1.next(timeoutMs);
  if (!isRecord(welcome1) || welcome1.type !== "welcome") {
    fail(`Expected welcome on client1, got: ${JSON.stringify(welcome1)}`);
  }
  const welcome2 = await stream2.next(timeoutMs);
  if (!isRecord(welcome2) || welcome2.type !== "welcome") {
    fail(`Expected welcome on client2, got: ${JSON.stringify(welcome2)}`);
  }
  console.log("OK  welcome (2 clients)");

  ws1.send(JSON.stringify({ type: "subscribe", projectId }));
  ws2.send(JSON.stringify({ type: "subscribe", projectId }));

  const sub1 = await stream1.next(timeoutMs);
  if (!isRecord(sub1) || sub1.type !== "subscribed") {
    fail(`Expected subscribed on client1, got: ${JSON.stringify(sub1)}`);
  }
  const sub2 = await stream2.next(timeoutMs);
  if (!isRecord(sub2) || sub2.type !== "subscribed") {
    fail(`Expected subscribed on client2, got: ${JSON.stringify(sub2)}`);
  }
  console.log("OK  subscribed (2 clients)");

  async function expectOnBoth(
    kind: "task" | "comment" | "project",
    eventType: string,
  ): Promise<[
    { projectId: string; event: Record<string, unknown> },
    { projectId: string; event: Record<string, unknown> },
  ]> {
    const [r1, r2] = await Promise.all([
      expectRealtime(stream1, kind, eventType, timeoutMs),
      expectRealtime(stream2, kind, eventType, timeoutMs),
    ]);
    return [r1, r2];
  }

  const patchProj = await fetchJson(baseUrl, "PATCH", `/api/projects/${projectId}`, {
    name: patchedProjectName,
  });
  if (!patchProj.ok) {
    fail(`PATCH project -> ${patchProj.status}: ${JSON.stringify(patchProj.data)}`);
  }
  {
    const [r1, r2] = await expectOnBoth("project", "project.updated");
    const pid1 = r1.projectId;
    const pid2 = r2.projectId;
    const event1 = r1.event;
    const event2 = r2.event;
    if (pid1 !== projectId || pid2 !== projectId) {
      fail(
        `project.updated projectId mismatch: ${JSON.stringify({
          pid1,
          pid2,
          projectId,
        })}`,
      );
    }
    const projRow1 = event1.project;
    const projRow2 = event2.project;
    if (
      !isRecord(projRow1) ||
      !isRecord(projRow2) ||
      projRow1.name !== patchedProjectName ||
      projRow2.name !== patchedProjectName
    ) {
      fail(
        `project.updated.project mismatch: ${JSON.stringify({
          projRow1,
          projRow2,
        })}`,
      );
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
    const [r1, r2] = await expectOnBoth("task", "task.created");
    const pid1 = r1.projectId;
    const pid2 = r2.projectId;
    const event1 = r1.event;
    const event2 = r2.event;
    if (pid1 !== projectId || pid2 !== projectId) {
      fail(
        `task.created projectId mismatch: ${JSON.stringify({
          pid1,
          pid2,
          projectId,
        })}`,
      );
    }
    if (event1.taskId !== taskAId || event2.taskId !== taskAId) {
      fail(`task.created ids mismatch: ${JSON.stringify({ pid1, pid2, event1, event2 })}`);
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
    const [r1, r2] = await expectOnBoth("task", "task.updated");
    const event1 = r1.event;
    const event2 = r2.event;
    if (event1.taskId !== taskAId || event2.taskId !== taskAId) {
      fail(`task.updated taskId mismatch: ${JSON.stringify({ event1, event2 })}`);
    }
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
    const [r1, r2] = await expectOnBoth("task", "task.statusChanged");
    const event1 = r1.event;
    const event2 = r2.event;
    if (
      event1.taskId !== taskAId ||
      event2.taskId !== taskAId ||
      event1.toStatus !== "in_progress" ||
      event2.toStatus !== "in_progress"
    ) {
      fail(`task.statusChanged mismatch: ${JSON.stringify({ event1, event2 })}`);
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
    const [r1, r2] = await expectOnBoth("task", "task.created");
    const event1 = r1.event;
    const event2 = r2.event;
    if (event1.taskId !== taskBId || event2.taskId !== taskBId) {
      fail(
        `second task.created mismatch: ${JSON.stringify({
          event1,
          event2,
        })}`,
      );
    }
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
    const [r1, r2] = await expectOnBoth("task", "task.dependenciesChanged");
    const event1 = r1.event;
    const event2 = r2.event;
    if (
      event1.taskId !== taskAId ||
      event2.taskId !== taskAId ||
      !Array.isArray(event1.dependencyIds) ||
      !Array.isArray(event2.dependencyIds)
    ) {
      fail(
        `task.dependenciesChanged mismatch: ${JSON.stringify({
          event1,
          event2,
        })}`,
      );
    }
    const depIds1 = event1.dependencyIds as unknown[];
    const depIds2 = event2.dependencyIds as unknown[];
    if (
      depIds1.length !== 1 ||
      depIds1[0] !== taskBId ||
      depIds2.length !== 1 ||
      depIds2[0] !== taskBId
    ) {
      fail(
        `dependencyIds expected [${taskBId}], got ${JSON.stringify({
          depIds1,
          depIds2,
        })}`,
      );
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
    const [r1, r2] = await expectOnBoth("comment", "comment.created");
    const pid1 = r1.projectId;
    const pid2 = r2.projectId;
    const event1 = r1.event;
    const event2 = r2.event;
    if (pid1 !== projectId || pid2 !== projectId) {
      fail(
        `comment.created projectId mismatch: ${JSON.stringify({
          pid1,
          pid2,
          projectId,
        })}`,
      );
    }
    if (event1.taskId !== taskAId || event2.taskId !== taskAId) {
      fail(`comment.created taskId mismatch: ${JSON.stringify({ event1, event2 })}`);
    }
    const comment1 = event1.comment;
    const comment2 = event2.comment;
    if (
      !isRecord(comment1) ||
      !isRecord(comment2) ||
      comment1.content !== "hello broadcast" ||
      comment2.content !== "hello broadcast"
    ) {
      fail(`comment.created.comment mismatch: ${JSON.stringify({ comment1, comment2 })}`);
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
    const [r1, r2] = await expectOnBoth("task", "task.dependenciesChanged");
    const event1 = r1.event;
    const event2 = r2.event;
    if (
      !Array.isArray(event1.dependencyIds) ||
      event1.dependencyIds.length !== 0 ||
      !Array.isArray(event2.dependencyIds) ||
      event2.dependencyIds.length !== 0
    ) {
      fail(
        `expected empty dependencyIds: ${JSON.stringify({
          event1,
          event2,
        })}`,
      );
    }
    console.log("OK  broadcast task.dependenciesChanged (clear)");
  }

  const delB = await fetchJson(baseUrl, "DELETE", `/api/tasks/${taskBId}`);
  if (!delB.ok && delB.status !== 204) {
    fail(`DELETE task B -> ${delB.status}`);
  }
  {
    const [r1, r2] = await expectOnBoth("task", "task.deleted");
    const pid1 = r1.projectId;
    const pid2 = r2.projectId;
    const event1 = r1.event;
    const event2 = r2.event;
    if (pid1 !== projectId || pid2 !== projectId || event1.taskId !== taskBId || event2.taskId !== taskBId) {
      fail(
        `task.deleted mismatch: ${JSON.stringify({
          pid1,
          pid2,
          event1,
          event2,
        })}`,
      );
    }
    console.log("OK  broadcast task.deleted");
  }

  const delA = await fetchJson(baseUrl, "DELETE", `/api/tasks/${taskAId}`);
  if (!delA.ok && delA.status !== 204) {
    fail(`DELETE task A -> ${delA.status}`);
  }
  {
    const [r1, r2] = await expectOnBoth("task", "task.deleted");
    const event1 = r1.event;
    const event2 = r2.event;
    if (event1.taskId !== taskAId || event2.taskId !== taskAId) {
      fail(`task.deleted A mismatch: ${JSON.stringify({ event1, event2 })}`);
    }
    console.log("OK  broadcast task.deleted (A)");
  }

  ws1.close();
  ws2.close();
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
