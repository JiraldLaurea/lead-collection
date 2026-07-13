export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSmsBatch, type SmsResult } from "@/lib/sms";
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

  const messages = recipients.map((lead) => ({
    phone: lead.phone,
    message: buildLeadSmsBody(parsed.data.body, lead.businessName)
  }));

  // Submits are pipelined at the provider's permitted rate rather than one at a time.
  const sendResults: SmsResult[] = debugSettings.smsDryRunEnabled
    ? messages.map(() => ({ success: true, provider_message_id: `dryrun_${Date.now()}` }))
    : await sendSmsBatch(messages);

  const sentAt = new Date();
  const results = recipients.map((lead, index) => {
    const result = sendResults[index] ?? { success: false, error: "No result returned" };
    return {
      id: lead.id,
      phone: lead.phone,
      sent: result.success,
      error: result.success ? undefined : result.error || "Unable to send SMS",
      providerMessageId: result.provider_message_id ?? null,
      body: messages[index].message,
      businessName: lead.businessName
    };
  });

  // One write for the whole batch instead of three queries per recipient. On the hosted
  // database each of those was a network round-trip, which dominated the send time.
  await prisma.smsLog.createMany({
    data: results.map((result) => ({
      leadId: result.id,
      businessName: result.businessName,
      phone: result.phone,
      status: result.sent ? "sent" : "failed",
      provider,
      body: result.body,
      providerMessageId: result.sent ? result.providerMessageId : null,
      errorMessage: result.sent ? null : result.error,
      sentAt
    }))
  });
  await recordSmsActivities(results.map((result) => ({ leadId: result.id, phone: result.phone, status: result.sent ? "sent" : "failed" })));

  const sent = results.filter((result) => result.sent).length;
  const failed = results.length - sent;
  if (sent === 0) return fail("E-SMS-03", "SMS sending failed", 500, results);

  return ok({ sent, failed, results, screening: screening.summary, excluded: screening.excluded });
}

/**
 * Links the sends back to each lead's activity timeline, alongside the existing SmsLog.
 * Resolves every SME profile in one query rather than one lookup per recipient.
 */
async function recordSmsActivities(entries: { leadId: number; phone: string; status: string }[]) {
  if (entries.length === 0) return;

  const profiles = await prisma.smeBusinessProfile.findMany({
    where: { leadId: { in: entries.map((entry) => entry.leadId) } },
    select: { id: true, leadId: true }
  });
  const businessByLead = new Map(profiles.map((profile) => [profile.leadId, profile.id]));

  await prisma.contactActivity.createMany({
    data: entries.map((entry) => ({
      leadId: entry.leadId,
      businessId: businessByLead.get(entry.leadId) ?? null,
      type: "SMS",
      channel: "sms",
      status: entry.status,
      metadata: JSON.stringify({ phone: entry.phone })
    }))
  });
}
