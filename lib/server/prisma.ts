import { PrismaClient } from "@/generated/prisma/client";
import path from "node:path";

/**
 * Prisma resolves relative SQLite URLs against the schema directory (prisma/),
 * not the process cwd. Next must use the same file or tables appear "missing".
 */
function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  if (raw.startsWith("file:")) {
    const rest = raw.slice("file:".length);
    if (rest.startsWith("./") || rest.startsWith("../")) {
      const schemaDir = path.join(process.cwd(), "prisma");
      const absolutePath = path.resolve(schemaDir, rest);
      return `file:${absolutePath}`;
    }
  }

  return raw;
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: resolveDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

