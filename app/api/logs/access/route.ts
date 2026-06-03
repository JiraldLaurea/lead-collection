import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET() {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const logs = await prisma.accessLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return ok(logs);
}
