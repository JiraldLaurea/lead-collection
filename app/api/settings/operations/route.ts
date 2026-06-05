import { disableAutomationStatus, ensureAutomationRunning } from "@/lib/auto-email";
import { fail, ok } from "@/lib/http";
import { normalizeDailyLimit, saveOperationsSettings } from "@/lib/operations-settings";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { autoEmailEnabled?: boolean; autoEmailDailyLimit?: number } | null;
  if (!body) return fail("E-SETTINGS-02", "Invalid operations settings request", 400);

  const settings = await saveOperationsSettings({
    autoEmailEnabled: body.autoEmailEnabled === true,
    autoEmailDailyLimit: normalizeDailyLimit(String(body.autoEmailDailyLimit ?? ""))
  });

  if (settings.autoEmailEnabled) {
    await ensureAutomationRunning("settings save");
  } else {
    await disableAutomationStatus();
  }

  return ok(settings);
}
