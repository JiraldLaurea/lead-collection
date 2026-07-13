export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSmsBatch, type SmsResult } from "@/lib/sms";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const requestSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(5000),
  body: z.string().trim().min(1).max(1000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-CSV-SMS-01", "Invalid SMS request.", 400, parsed.error.flatten());
  const leads = await prisma.importedCsvLead.findMany({
    where: { id: { in: parsed.data.leadIds } },
    select: { id: true, businessName: true, phoneNumber: true }
  });

  // Opt-out must hold on every send path, not just the one the SME feature happens to use.
  // An imported CSV list is exactly where an opted-out number is most likely to reappear.
  const screening = await screenSmsRecipients(leads);
  const recipients = screening.sendable;

  if (recipients.length === 0) {
    return fail("E-CSV-SMS-02", "No selected leads have a contactable Philippine mobile number.", 400, {
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
      businessName: lead.businessName,
      body: messages[index].message
    };
  });

  await prisma.smsLog.createMany({
    data: results.map((result) => ({
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

  const sent = results.filter((result) => result.sent).length;
  if (sent === 0) return fail("E-CSV-SMS-03", "SMS sending failed.", 500, results);
  return ok({
    sent,
    failed: results.length - sent,
    results,
    screening: screening.summary,
    excluded: screening.excluded
  });
}
