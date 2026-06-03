import { buildLeadWhere, parseLeadFilters } from "@/lib/leads";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") || 1);
  const pageSize = Math.min(Number(url.searchParams.get("pageSize") || 50), 200);
  const filters = parseLeadFilters(url.searchParams);
  const where = buildLeadWhere(filters);
  const [items, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: { collectedAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.lead.count({ where })
  ]);
  return ok(items, { page, pageSize, total });
}

export async function DELETE() {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const result = await prisma.lead.deleteMany();
  return ok({ deleted: result.count });
}
