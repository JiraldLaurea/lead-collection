import { prisma } from "@/lib/prisma";
import { ok, fail } from "@/lib/http";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return ok({
      status: "ok",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      database: "ok"
    });
  } catch {
    return fail("E-HEALTH-01", "Database health check failed", 503);
  }
}
