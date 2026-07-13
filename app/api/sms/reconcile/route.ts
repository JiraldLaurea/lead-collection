export const runtime = "nodejs";

import { fail, ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";
import { reconcilePendingSms } from "@/lib/sms-reconcile";

/**
 * Resolves SMS messages left at "pending receipt" by querying the SMSC directly.
 *
 * Safe to call repeatedly; it only looks at messages older than the minimum age and stops as
 * soon as a message reaches a final state. Intended to be run on a schedule, but it is also
 * useful on demand from the SMS Log when a message has been pending for a while.
 */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const url = new URL(request.url);
  const minAgeMinutes = Number(url.searchParams.get("minAgeMinutes") ?? 10);
  const limit = Number(url.searchParams.get("limit") ?? 50);

  try {
    const result = await reconcilePendingSms({
      minAgeMinutes: Number.isFinite(minAgeMinutes) ? minAgeMinutes : 10,
      limit: Number.isFinite(limit) ? limit : 50
    });
    return ok(result);
  } catch (error) {
    return fail("E-SMS-05", error instanceof Error ? error.message : "Unable to reconcile pending SMS", 500);
  }
}
