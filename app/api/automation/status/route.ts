import { getAutomationStatus, ensureAutomationRunning } from "@/lib/auto-email";
import { ok } from "@/lib/http";
import { getOperationsSettings } from "@/lib/operations-settings";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const settings = await getOperationsSettings();
  if (settings.autoEmailEnabled) {
    await ensureAutomationRunning("status check");
  }

  return ok(await getAutomationStatus());
}
