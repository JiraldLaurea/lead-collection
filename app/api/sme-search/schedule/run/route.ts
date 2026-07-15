import { fail, ok } from "@/lib/http";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { runScheduledSmeSearch } from "@/lib/sme/scheduled-search";

export const runtime = "nodejs";

export async function POST() {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  try {
    return ok(await runScheduledSmeSearch({ force: true }));
  } catch (error) {
    return fail("E-SME-SCHEDULE-01", error instanceof Error ? error.message : "Scheduled SME search failed.", 500);
  }
}
