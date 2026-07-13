export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSms } from "@/lib/sms";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const recipientSchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1)
});

const requestSchema = z.object({
  recipients: z.array(recipientSchema).min(1).max(500),
  body: z.string().trim().min(1).max(1000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return fail("E-MANUAL-SMS-01", "Enter valid recipients and message.", 400, parsed.error.flatten());

  // Typing a number by hand must not be a way around an opt-out. The same screening runs
  // here as on every other send path: it also de-duplicates and drops invalid numbers, which
  // this route previously did itself.
  const screening = await screenSmsRecipients(
    parsed.data.recipients.map((recipient, index) => ({
      id: index,
      businessName: recipient.name?.trim() || "Manual SMS",
      phoneNumber: recipient.phone
    }))
  );

  const uniqueRecipients = screening.sendable.map((recipient) => ({
    name: recipient.businessName,
    phone: recipient.phone
  }));

  if (uniqueRecipients.length === 0) {
    return fail("E-MANUAL-SMS-02", "No contactable Philippine mobile number was entered.", 400, {
      screening: screening.summary,
      excluded: screening.excluded
    });
  }

  const debugSettings = await getDebugSettings();
  const provider = process.env.SMS_PROVIDER ?? "mock";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      let failed = 0;
      for (const [index, recipient] of uniqueRecipients.entries()) {
        let errorMessage: string | undefined;
        const message = buildLeadSmsBody(parsed.data.body, recipient.name);
        try {
          const result = debugSettings.smsDryRunEnabled
            ? { success: true, provider_message_id: `dryrun_${Date.now()}` }
            : await sendSms(recipient.phone, message);

          if (!result.success) throw new Error(result.error || "Unable to send SMS");

          await prisma.smsLog.create({
            data: {
              businessName: recipient.name,
              phone: recipient.phone,
              status: "sent",
              provider,
              body: message,
              providerMessageId: result.provider_message_id ?? null,
              sentAt: new Date()
            }
          });
          sent += 1;
        } catch (error) {
          errorMessage = error instanceof Error ? error.message : "Unable to send SMS";
          await prisma.smsLog.create({
            data: {
              businessName: recipient.name,
              phone: recipient.phone,
              status: "failed",
              provider,
              body: message,
              errorMessage,
              sentAt: new Date()
            }
          });
          failed += 1;
        }
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "progress",
              completed: index + 1,
              total: uniqueRecipients.length,
              sent,
              failed,
              // Extra field on the existing event shape, so the current parser is unaffected.
              suppressed: screening.excluded.length,
              error: errorMessage
            })}\n`
          )
        );
      }
      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
