import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

export async function DELETE(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { ids?: unknown } | null;
  const ids = Array.isArray(body?.ids)
    ? body.ids.filter((id): id is number => Number.isInteger(id) && id > 0)
    : [];

  if (ids.length === 0) {
    return fail("E-EMAIL-LOG-01", "Select at least one email log to delete.", 400);
  }

  const result = await prisma.emailLog.deleteMany({
    where: { id: { in: ids } }
  });

  return ok({ deleted: result.count });
}
