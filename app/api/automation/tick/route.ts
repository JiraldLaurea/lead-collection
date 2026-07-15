import { ensureOutreachRunning, getOutreachStatus, usesHostedAutomation } from "@/lib/auto-outreach";
import { ok } from "@/lib/http";
import { getOperationsSettings } from "@/lib/operations-settings";
import { requireApiAdmin } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const settings = await getOperationsSettings();
  if (settings.autoOutreachEnabled && !usesHostedAutomation()) {
    await ensureOutreachRunning("browser polling");
  }

  return ok(await getOutreachStatus());
}
