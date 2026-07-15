import { usesHostedAutomation } from "@/lib/auto-outreach";
import { ok } from "@/lib/http";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { runScheduledSmeSearch } from "@/lib/sme/scheduled-search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  if (usesHostedAutomation()) return ok({ processed: false, reason: "Hosted scheduling is handled by Vercel Cron." });
  return ok(await runScheduledSmeSearch({ local: true }));
}
