export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSmsBatch, type SmsResult } from "@/lib/sms";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const schema = z.object({
  businessIds: z.array(z.number().int().positive()).min(1).max(50),
  body: z.string().trim().min(1).max(1000)
});

/** Sends SMS directly from captured SME profiles and records activity without creating Leads. */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-SMS-02", "Invalid SMS request", 400, parsed.error.flatten());

  const businesses = await prisma.smeBusinessProfile.findMany({
    where: { id: { in: parsed.data.businessIds } },
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
  if (screening.sendable.length === 0) {
    return fail("E-SME-SMS-03", "No selected businesses have a contactable mobile number", 400, {
      screening: screening.summary,
      excluded: screening.excluded
    });
  }

  const debugSettings = await getDebugSettings();
  const provider = process.env.SMS_PROVIDER ?? "mock";
  const messages = screening.sendable.map((business) => ({
    phone: business.phone,
    message: buildLeadSmsBody(parsed.data.body, business.businessName)
  }));
  const sendResults: SmsResult[] = debugSettings.smsDryRunEnabled
    ? messages.map(() => ({ success: true, provider_message_id: `dryrun_${Date.now()}` }))
    : await sendSmsBatch(messages);

  const sentAt = new Date();
  const results = screening.sendable.map((business, index) => {
    const result = sendResults[index] ?? { success: false, error: "No result returned" };
    return {
      businessId: business.id,
      businessName: business.businessName,
      phone: business.phone,
      sent: result.success,
      error: result.success ? undefined : result.error || "Unable to send SMS",
      providerMessageId: result.provider_message_id ?? null,
      body: messages[index].message
    };
  });

  await prisma.$transaction([
    prisma.smsLog.createMany({
      data: results.map((result) => ({
        leadId: null,
        businessName: result.businessName,
        phone: result.phone,
        status: result.sent ? "sent" : "failed",
        provider,
        body: result.body,
        providerMessageId: result.sent ? result.providerMessageId : null,
        errorMessage: result.sent ? null : result.error,
        sentAt
      }))
    }),
    prisma.contactActivity.createMany({
      data: results.map((result) => ({
        businessId: result.businessId,
        type: "SMS",
        channel: "sms",
        status: result.sent ? "sent" : "failed",
        metadata: JSON.stringify({ phone: result.phone })
      }))
    })
  ]);

  const sent = results.filter((result) => result.sent).length;
  const failed = results.length - sent;
  if (sent === 0) return fail("E-SME-SMS-04", "SMS sending failed", 500, results);

  return ok({ sent, failed, results, screening: screening.summary, excluded: screening.excluded });
}
