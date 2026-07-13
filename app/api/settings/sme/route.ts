export const runtime = "nodejs";

import { z } from "zod";
import { saveSmeSearchEnabled } from "@/lib/feature-flags";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";
import { saveSmeSettings, weightsTotal } from "@/lib/sme/settings";

const schema = z.object({
  enabled: z.boolean(),
  weights: z.object({
    smeConfidence: z.number().min(0).max(100),
    marketingNeed: z.number().min(0).max(100),
    businessPotential: z.number().min(0).max(100),
    contactAvailability: z.number().min(0).max(100),
    areaValue: z.number().min(0).max(100)
  }),
  thresholds: z.object({
    localChainMax: z.number().int().min(1).max(50),
    manualReviewMax: z.number().int().min(1).max(100)
  })
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("E-SETTINGS-04", "Invalid SME settings", 400, parsed.error.flatten());
  }

  // A score is out of 100 by definition; weights that do not add up would make bands
  // meaningless (an 80 would no longer mean the same thing across searches).
  const total = weightsTotal(parsed.data.weights);
  if (total !== 100) {
    return fail("E-SETTINGS-05", `Scoring weights must add up to 100 (currently ${total}).`, 400);
  }

  if (parsed.data.thresholds.manualReviewMax < parsed.data.thresholds.localChainMax) {
    return fail("E-SETTINGS-06", "The manual-review ceiling must be at least the local-chain ceiling.", 400);
  }

  const saved = await saveSmeSettings({ weights: parsed.data.weights, thresholds: parsed.data.thresholds });
  await saveSmeSearchEnabled(parsed.data.enabled);

  return ok({ enabled: parsed.data.enabled, ...saved });
}
