export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSms } from "@/lib/sms";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const requestSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(50),
  body: z.string().trim().min(1).max(1000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SMS-01", "Invalid SMS request", 400, parsed.error.flatten());

  const leads = await prisma.lead.findMany({
    where: { id: { in: parsed.data.leadIds } },
    select: {
      id: true,
      businessName: true,
      phoneNumber: true
    }
  });

  // Suppression is enforced here, on the server, not only in the composer: a check that
  // lives only in the UI can be bypassed by calling this route directly, and the work order
  // treats bypassable opt-out as a non-acceptance condition. With an empty Do Not Contact
  // list this behaves exactly as it did before.
  const screening = await screenSmsRecipients(leads);
  const recipients = screening.sendable;

  if (recipients.length === 0) {
    return fail("E-SMS-02", "No selected leads have a contactable mobile number", 400, {
      screening: screening.summary,
      excluded: screening.excluded
    });
  }

  const debugSettings = await getDebugSettings();
  const provider = process.env.SMS_PROVIDER ?? "mock";
  const results = [];

  for (const lead of recipients) {
    const message = buildLeadSmsBody(parsed.data.body, lead.businessName);
    try {
      const result = debugSettings.smsDryRunEnabled
        ? { success: true, provider_message_id: `dryrun_${Date.now()}` }
        : await sendSms(lead.phone, message);

      if (!result.success) {
        throw new Error(result.error || "Unable to send SMS");
      }

      await prisma.smsLog.create({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          phone: lead.phone,
          status: "sent",
          provider,
          body: message,
          providerMessageId: result.provider_message_id ?? null,
          sentAt: new Date()
        }
      });
      await recordSmsActivity(lead.id, lead.phone, "sent");
      results.push({ id: lead.id, phone: lead.phone, sent: true });
    } catch (error) {
      await prisma.smsLog.create({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          phone: lead.phone,
          status: "failed",
          provider,
          body: message,
          errorMessage: error instanceof Error ? error.message : "Unable to send SMS",
          sentAt: new Date()
        }
      });
      await recordSmsActivity(lead.id, lead.phone, "failed");
      results.push({
        id: lead.id,
        phone: lead.phone,
        sent: false,
        error: error instanceof Error ? error.message : "Unable to send SMS"
      });
    }
  }

  const sent = results.filter((result) => result.sent).length;
  const failed = results.length - sent;
  if (sent === 0) return fail("E-SMS-03", "SMS sending failed", 500, results);

  return ok({ sent, failed, results, screening: screening.summary, excluded: screening.excluded });
}

/** Links the send back to the lead's activity timeline, alongside the existing SmsLog. */
async function recordSmsActivity(leadId: number, phone: string, status: string) {
  const profile = await prisma.smeBusinessProfile.findFirst({
    where: { leadId },
    select: { id: true }
  });

  await prisma.contactActivity.create({
    data: {
      leadId,
      businessId: profile?.id ?? null,
      type: "SMS",
      channel: "sms",
      status,
      metadata: JSON.stringify({ phone })
    }
  });
}
