import { getAutomationStatus } from "@/lib/auto-email";
import { ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  return ok(await getAutomationStatus());
}
