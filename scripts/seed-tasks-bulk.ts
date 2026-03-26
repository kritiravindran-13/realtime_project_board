/**
 * Create many tasks in one project (for load testing / demos).
 *
 *   npx tsx scripts/seed-tasks-bulk.ts [projectId] [count]
 *
 * Defaults: projectId from first arg or env SEED_PROJECT_ID, count 100.
 */
import "dotenv/config";
import { prisma } from "../lib/server/prisma";

const projectId =
  process.argv[2] ?? process.env.SEED_PROJECT_ID ?? "cmn6nz3hh00019k2f170fgoj7";
const count = Math.max(1, Number.parseInt(process.argv[3] ?? "100", 10) || 100);

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    console.error(`Project not found: ${projectId}`);
    process.exit(1);
  }

  const data = Array.from({ length: count }, (_, i) => ({
    projectId,
    title: `Bulk task ${i + 1}`,
    status: "todo",
  }));

  const result = await prisma.task.createMany({ data });

  console.log(
    `Created ${result.count} tasks with status "todo" in project "${project.name}" (${project.id}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
