import { ensureTestAutomationRunning } from "@/lib/auto-email";
import { ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  return ok(await ensureTestAutomationRunning());
}
