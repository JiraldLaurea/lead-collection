export const runtime = "nodejs";

import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const schema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(50)
});

/**
 * Dry-run of the same screening the send route enforces, so the composer can show the user
 * exactly who will be excluded and why before they confirm. Sends nothing.
 */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SMS-01", "Invalid screening request", 400, parsed.error.flatten());

  const leads = await prisma.lead.findMany({
    where: { id: { in: parsed.data.leadIds } },
    select: { id: true, businessName: true, phoneNumber: true }
  });

  const screening = await screenSmsRecipients(leads);

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
