import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaUsesLibSqlAdapter?: boolean;
};

process.env.DATABASE_URL ||= "file:../data/leads.sqlite";

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;
  const databaseUrl = process.env.DATABASE_URL!;
  // Prisma resolves SQLite URLs relative to schema.prisma. LibSQL resolves them
  // relative to the process, so convert the local schema-relative URL to an
  // absolute path before passing it to the adapter.
  const url = tursoUrl || toLibSqlLocalUrl(databaseUrl);
  const adapter = new PrismaLibSQL(
    tursoUrl && tursoAuthToken
      ? { url, authToken: tursoAuthToken }
      : { url }
  );

  return new PrismaClient({
    // Prisma 6.19 requires an adapter for this SQLite schema. PrismaLibSQL supports
    // both the local file URL and the authenticated Turso URL used in production.
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });
}

function toLibSqlLocalUrl(url: string) {
  if (!url.startsWith("file:")) return url;

  const filePath = url.slice("file:".length);
  if (path.isAbsolute(filePath)) return url;

  return `file:${path.resolve(process.cwd(), "prisma", filePath).replace(/\\/g, "/")}`;
}

export const prisma =
  (globalForPrisma.prismaUsesLibSqlAdapter ? globalForPrisma.prisma : undefined) ??
  createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUsesLibSqlAdapter = true;
}
