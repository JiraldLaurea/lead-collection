export const runtime = "nodejs";

import { z } from "zod";
import { screenEmailRecipients } from "@/lib/email-suppression";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";

const schema = z.object({
  providerPlaceIds: z.array(z.string().min(1)).min(1).max(200)
});

/** Screens captured SME profiles without requiring that they are also legacy Lead records. */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-EMAIL-02", "Invalid email screening request", 400, parsed.error.flatten());

  const businesses = await prisma.smeBusinessProfile.findMany({
    where: { providerPlaceId: { in: parsed.data.providerPlaceIds } },
    select: { id: true, displayName: true, email: true }
  });
  const screening = await screenEmailRecipients(
    businesses.map((business) => ({ id: business.id, businessName: business.displayName, email: business.email }))
  );

  return ok({
    summary: screening.summary,
    sendable: screening.sendable,
    excluded: screening.excluded
  });
}
