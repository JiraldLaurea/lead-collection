export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSms } from "@/lib/sms";
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
  const results = [];
  for (const lead of recipients) {
    const message = buildLeadSmsBody(parsed.data.body, lead.businessName);
    try {
      const result = debugSettings.smsDryRunEnabled ? { success: true, provider_message_id: `dryrun_${Date.now()}` } : await sendSms(lead.phone, message);
      if (!result.success) throw new Error(result.error || "Unable to send SMS");
      await prisma.smsLog.create({ data: { businessName: lead.businessName, phone: lead.phone, status: "sent", provider, body: message, providerMessageId: result.provider_message_id ?? null, sentAt: new Date() } });
      results.push({ id: lead.id, phone: lead.phone, sent: true });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Unable to send SMS";
      await prisma.smsLog.create({ data: { businessName: lead.businessName, phone: lead.phone, status: "failed", provider, body: message, errorMessage: messageText, sentAt: new Date() } });
      results.push({ id: lead.id, phone: lead.phone, sent: false, error: messageText });
    }
  }
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
