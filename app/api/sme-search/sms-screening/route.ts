export const runtime = "nodejs";

import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const schema = z.object({
  providerPlaceIds: z.array(z.string().min(1)).min(1).max(50)
});

/** Screens captured SME profiles without requiring them to be legacy Lead records. */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-SMS-01", "Invalid SMS screening request", 400, parsed.error.flatten());

  const businesses = await prisma.smeBusinessProfile.findMany({
    where: { providerPlaceId: { in: parsed.data.providerPlaceIds } },
    select: {
      id: true,
      displayName: true,
      phoneNumber: true,
      classification: { select: { effectiveClass: true } }
    }
  });
  const screening = await screenSmsRecipients(
    businesses.map((business) => ({
      id: business.id,
      businessName: business.displayName,
      phoneNumber: business.phoneNumber,
      classification: business.classification?.effectiveClass
    }))
  );

  return ok({
    summary: screening.summary,
    sendable: screening.sendable.map((recipient) => ({
      id: recipient.id,
      businessName: recipient.businessName,
      phone: recipient.phone
    })),
    excluded: screening.excluded
  });
}
