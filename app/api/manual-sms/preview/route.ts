import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { MAX_MANUAL_SMS_RECIPIENTS } from "@/lib/manual-sms";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const recipientSchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1)
});

const requestSchema = z.object({
  recipients: z.array(recipientSchema).max(MAX_MANUAL_SMS_RECIPIENTS)
});

/**
 * Preflights the manual composer so the displayed recipient count matches the server's
 * suppression decision before an operator presses Send. A number already handed to the
 * provider is never treated as a fresh recipient, even if its later DLR is unsuccessful.
 */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return fail("E-MANUAL-SMS-PREVIEW-01", "Enter valid recipients.", 400);

  try {
    const screening = await screenSmsRecipients(
      parsed.data.recipients.map((recipient, index) => ({
        id: index,
        businessName: recipient.name?.trim() || "Manual SMS",
        phoneNumber: recipient.phone
      }))
    );
    const phones = screening.sendable.map((recipient) => recipient.phone);
    const priorSubmissions = phones.length
      ? await prisma.smsLog.findMany({
          where: { phone: { in: phones }, providerMessageId: { not: null } },
          select: { phone: true }
        })
      : [];
    const alreadySentPhones = new Set(priorSubmissions.map((log) => log.phone));
    const alreadySentCount = screening.sendable.filter((recipient) => alreadySentPhones.has(recipient.phone)).length;

    return ok({
      sendableCount: screening.sendable.length - alreadySentCount,
      alreadySentCount,
      suppressedCount: screening.excluded.length
    });
  } catch (error) {
    console.error("Unable to preview manual SMS recipients", error);
    return fail("E-MANUAL-SMS-PREVIEW-02", "Unable to check previous SMS sends. Try again.", 500);
  }
}
