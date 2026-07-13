export const runtime = "nodejs";

import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";

const schema = z.object({
  providerPlaceId: z.string().min(1),
  effectiveClass: z.enum([
    "INDEPENDENT_SME",
    "LOCAL_SME_CHAIN",
    "MANUAL_REVIEW",
    "LARGE_CHAIN",
    "FRANCHISE_EXCLUDED",
    "MANUAL_INCLUDE",
    "MANUAL_EXCLUDE"
  ]),
  reason: z.string().trim().min(1).max(500)
});

/**
 * Records a human decision over the automatic classification.
 *
 * The automatic class is never overwritten: both survive, along with who changed it, when,
 * from what, and why. An exclusion that cannot be explained — or reversed — is not
 * acceptable (work order 6.5).
 *
 * Only a saved business can be overridden, because the override has to live somewhere.
 */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-07", "Invalid override request", 400, parsed.error.flatten());

  const profile = await prisma.smeBusinessProfile.findUnique({
    where: { providerPlaceId: parsed.data.providerPlaceId },
    include: { classification: true }
  });

  if (!profile || !profile.classification) {
    return fail("E-SME-08", "Save this business before changing its classification.", 404);
  }

  const previous = profile.classification.effectiveClass;

  const updated = await prisma.smeClassification.update({
    where: { businessId: profile.id },
    data: {
      effectiveClass: parsed.data.effectiveClass,
      previousClass: previous,
      overrideBy: "admin",
      overrideReason: parsed.data.reason,
      overriddenAt: new Date(),
      confidence: 100
    }
  });

  await prisma.contactActivity.create({
    data: {
      leadId: profile.leadId,
      businessId: profile.id,
      type: "CLASSIFICATION_OVERRIDE",
      channel: "SME_SEARCH",
      status: parsed.data.effectiveClass,
      note: parsed.data.reason,
      metadata: JSON.stringify({
        previousClass: previous,
        autoClass: profile.classification.autoClass,
        newClass: parsed.data.effectiveClass
      })
    }
  });

  return ok({
    providerPlaceId: parsed.data.providerPlaceId,
    autoClass: updated.autoClass,
    effectiveClass: updated.effectiveClass,
    previousClass: previous
  });
}
