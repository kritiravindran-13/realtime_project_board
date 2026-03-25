/**
 * Full realtime stack checks:
 *
 * 1. Synthetic {@link RealtimeMessage} via `POST /api/ws/publish/project`
 * 2. Mutation-driven `publishTaskEvent` / `publishCommentEvent` / `publishProjectEvent` (REST → DB → WS)
 *
 * Requires: `npm run dev` (custom server.ts + DB).
 *
 * Usage:
 *   npm run test:realtime
 *   BASE_URL=http://127.0.0.1:3000 npx tsx scripts/test-realtime.ts
 */

import { runMutationRealtimeE2e } from "./test-project-broadcast";
import { runSyntheticRealtimePublishE2e } from "./test-realtime-synthetic";

async function main() {
  console.log("--- (1/2) Synthetic RealtimeMessage + HTTP publish ---\n");
  await runSyntheticRealtimePublishE2e();

  console.log("\n--- (2/2) REST mutations → publish*Event ---\n");
  await runMutationRealtimeE2e();

  console.log("\nAll realtime tests passed.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
