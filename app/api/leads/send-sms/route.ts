export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { normalizePhilippineMobileNumber } from "@/lib/export";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSms } from "@/lib/sms";

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
    where: {
      id: { in: parsed.data.leadIds },
      phoneNumber: { not: null }
    },
    select: {
      id: true,
      businessName: true,
      phoneNumber: true
    }
  });

  const recipients = leads
    .map((lead) => ({ ...lead, phone: normalizePhilippineMobileNumber(lead.phoneNumber) }))
    .filter((lead): lead is typeof lead & { phone: string } => Boolean(lead.phone));

  if (recipients.length === 0) return fail("E-SMS-02", "No selected leads have a valid mobile number", 400);

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

  return ok({ sent, failed, results });
}
