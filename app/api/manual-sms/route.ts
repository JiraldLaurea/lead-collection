export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { buildLeadSmsBody, sendSms } from "@/lib/sms";
import { MAX_MANUAL_SMS_RECIPIENTS } from "@/lib/manual-sms";
import { screenSmsRecipients } from "@/lib/sme/suppression";

const recipientSchema = z.object({
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().min(1)
});

const requestSchema = z.object({
  recipients: z.array(recipientSchema).min(1).max(MAX_MANUAL_SMS_RECIPIENTS),
  body: z.string().trim().min(1).max(1000),
  // A client-generated key makes retries idempotent after an interruption.
  // Optional keeps requests from older app versions working as before.
  batchKey: z.string().uuid().optional()
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const payload = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) return fail("E-MANUAL-SMS-01", "Enter valid recipients and message.", 400, parsed.error.flatten());

  let screening: Awaited<ReturnType<typeof screenSmsRecipients>>;
  let uniqueRecipients: { name: string; phone: string }[];
  let alreadySubmittedPhones: Set<string>;
  let debugSettings: Awaited<ReturnType<typeof getDebugSettings>>;

  try {
    // Typing a number by hand must not be a way around an opt-out. The same screening runs
    // here as on every other send path: it also de-duplicates and drops invalid numbers.
    screening = await screenSmsRecipients(
      parsed.data.recipients.map((recipient, index) => ({
        id: index,
        businessName: recipient.name?.trim() || "Manual SMS",
        phoneNumber: recipient.phone
      }))
    );
    uniqueRecipients = screening.sendable.map((recipient) => ({
      name: recipient.businessName,
      phone: recipient.phone
    }));

    if (uniqueRecipients.length === 0) {
      return fail("E-MANUAL-SMS-02", "No contactable Philippine mobile number was entered.", 400, {
        screening: screening.summary,
        excluded: screening.excluded
      });
    }

    // A provider message ID is the durable checkpoint. A later UNDELIV receipt may change the
    // log status to failed, but it must not make a retry submit that same number again. This is
    // intentionally checked across the whole SMS history, not merely this browser batch.
    alreadySubmittedPhones = new Set(
      (
        await prisma.smsLog.findMany({
          where: {
            phone: { in: uniqueRecipients.map((recipient) => recipient.phone) },
            providerMessageId: { not: null }
          },
          select: { phone: true }
        })
      ).map((log) => log.phone)
    );
    debugSettings = await getDebugSettings();
  } catch (error) {
    console.error("Unable to prepare manual SMS send", error);
    return fail(
      "E-MANUAL-SMS-03",
      "Unable to prepare the SMS send. Confirm the database schema is up to date and try again.",
      500
    );
  }

  const recipientsToSend = uniqueRecipients.filter((recipient) => !alreadySubmittedPhones.has(recipient.phone));
  const provider = process.env.SMS_PROVIDER ?? "mock";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      let failed = 0;
      let alreadySent = alreadySubmittedPhones.size;
      let firstError: string | undefined;

      const emitProgress = (completed: number) => {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: "progress",
              completed,
              total: uniqueRecipients.length,
              sent,
              failed,
              alreadySent,
              suppressed: screening.excluded.length,
              error: firstError
            })}\n`
          )
        );
      };

      // This event makes a fully completed retry finish without any new SMPP submission.
      emitProgress(alreadySent);

      // Manual sends deliberately use the original one-at-a-time sender. It avoids pipelining
      // while an operator is testing a route and produces a distinct progress update for every
      // number. Bulk SME sends still use the rate-limited batch sender.
      for (const [index, recipient] of recipientsToSend.entries()) {
        const message = buildLeadSmsBody(parsed.data.body, recipient.name);
        let result: { success: boolean; provider_message_id?: string; error?: string };
        try {
          result = debugSettings.smsDryRunEnabled
            ? { success: true, provider_message_id: `dryrun_${Date.now()}` }
            : await sendSms(recipient.phone, message);
        } catch (error) {
          result = { success: false, error: error instanceof Error ? error.message : "Unable to send SMS" };
        }

        if (result.success) {
          sent += 1;
          alreadySent += 1;
        }
        else {
          failed += 1;
          firstError = firstError ?? result.error ?? "Unable to send SMS";
        }

        await prisma.smsLog.create({
          data: {
            businessName: recipient.name,
            phone: recipient.phone,
            status: result.success ? "sent" : "failed",
            provider,
            body: message,
            batchKey: parsed.data.batchKey ?? null,
            providerMessageId: result.success ? result.provider_message_id ?? null : null,
            errorMessage: result.success ? null : result.error ?? "Unable to send SMS",
            sentAt: new Date()
          }
        });

        emitProgress(alreadySubmittedPhones.size + index + 1);
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
