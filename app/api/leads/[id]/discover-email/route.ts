import { fail, ok } from "@/lib/http";
import { discoverLeadEmail } from "@/lib/email-discovery";
import { safeRedirect } from "@/lib/redirect";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const { id } = await params;
  const leadId = Number(id);
  if (!Number.isInteger(leadId)) return fail("E-LEADS-02", "Invalid lead id", 400);
  let result;
  try {
    result = await discoverLeadEmail(leadId);
  } catch (error) {
    return fail(
      "E-EMAIL-DISCOVERY-01",
      error instanceof Error ? error.message : "Unable to discover email",
      502
    );
  }
  if (new URL(_request.url).searchParams.get("redirect") === "true") {
    return safeRedirect(`/leads/${leadId}`);
  }
  if (result.status === "NOT_FOUND" && !result.email) return ok(result);
  return ok(result);
}
