/**
 * Removes duplicate `Project` rows with the same exact `name`, keeping the earliest id (lexicographic).
 * Deletes cascade tasks on removed projects. Run before `prisma db push` if unique on name fails.
 *
 *   npx tsx scripts/dedupe-project-names.ts
 */
import "dotenv/config";
import { prisma } from "../lib/server/prisma";

async function main() {
  const projects = await prisma.project.findMany({ orderBy: { id: "asc" } });
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const p of projects) {
    const list = byName.get(p.name) ?? [];
    list.push(p);
    byName.set(p.name, list);
  }

  let removed = 0;
  for (const [, list] of byName) {
    if (list.length <= 1) continue;
    const [, ...dupes] = list;
    for (const d of dupes) {
      await prisma.project.delete({ where: { id: d.id } });
      console.log(`Removed duplicate project ${d.id} (${d.name})`);
      removed += 1;
    }
  }

  if (removed === 0) {
    console.log("No duplicate project names found.");
  } else {
    console.log(`Done. Removed ${removed} duplicate row(s).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
