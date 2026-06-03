import { NextRequest } from "next/server";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { safeRedirect } from "@/lib/redirect";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id: Number(id) } });
  if (!lead) return fail("E-LEADS-01", "Lead not found", 404);
  return ok(lead);
}

async function deleteLead(id: string) {
  const lead = await prisma.lead.findUnique({ where: { id: Number(id) } });
  if (!lead) return fail("E-LEADS-01", "Lead not found", 404);
  await prisma.lead.delete({ where: { id: Number(id) } });
  return ok({ deleted: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const { id } = await params;
  return deleteLead(id);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const { id } = await params;
  if (request.nextUrl.searchParams.get("_method") === "DELETE") {
    await deleteLead(id);
    return safeRedirect("/leads");
  }
  return fail("E-LEADS-02", "Unsupported method override", 400);
}
