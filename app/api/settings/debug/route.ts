import { fail, ok } from "@/lib/http";
import { saveDebugSettings } from "@/lib/debug-settings";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as { emailDryRunEnabled?: boolean; smsDryRunEnabled?: boolean } | null;
  if (!body) return fail("E-SETTINGS-02", "Invalid debug settings request", 400);

  const settings = await saveDebugSettings({
    emailDryRunEnabled: body.emailDryRunEnabled === true,
    smsDryRunEnabled: body.smsDryRunEnabled === true
  });

  return ok(settings);
}
