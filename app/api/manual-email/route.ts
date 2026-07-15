export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { getEmailTemplateDefaultAttachment } from "@/lib/email-template";
import { fail } from "@/lib/http";
import { sendManualEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { screenEmailRecipients } from "@/lib/email-suppression";

const requestSchema = z.object({
  recipients: z.array(z.string().trim().email()).min(1).max(500),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000)
});
const maxAttachmentCount = 5;
const maxAttachmentSize = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const recipients = JSON.parse(String(formData.get("recipients") || "[]"));
    const parsed = requestSchema.safeParse({ recipients, subject: formData.get("subject"), body: formData.get("body") });
    if (!parsed.success) return fail("E-MANUAL-EMAIL-01", "Enter valid recipients, subject, and message.", 400, parsed.error.flatten());

    const files = formData.getAll("attachments").filter((item): item is File => item instanceof File);
    if (files.length > maxAttachmentCount) return fail("E-MANUAL-EMAIL-02", "Attach up to 5 files only.", 400);
    const uploadedAttachments = await Promise.all(files.map(async (file) => {
      if (file.size > maxAttachmentSize) throw new Error(`Attachment "${file.name}" is larger than 10MB.`);
      return { filename: file.name, content: Buffer.from(await file.arrayBuffer()), contentType: file.type || undefined };
    }));
    const defaultAttachment = await getEmailTemplateDefaultAttachment();
    const attachments = defaultAttachment ? [defaultAttachment, ...uploadedAttachments] : uploadedAttachments;
    const screening = await screenEmailRecipients(
      parsed.data.recipients.map((email, index) => ({ id: index + 1, businessName: "Manual email", email }))
    );
    const uniqueRecipients = screening.sendable.map((recipient) => recipient.email);
    if (uniqueRecipients.length === 0) {
      return fail("E-MANUAL-EMAIL-04", "Every recipient is excluded by the Do Not Contact list.", 400, {
        screening: screening.summary,
        excluded: screening.excluded
      });
    }
    const debugSettings = await getDebugSettings();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let sent = 0;
        let failed = 0;
        for (const [index, email] of uniqueRecipients.entries()) {
          let errorMessage: string | undefined;
          try {
            if (!debugSettings.emailDryRunEnabled) {
              await sendManualEmail({ email, subject: parsed.data.subject, body: parsed.data.body, attachments });
            }
            await prisma.emailLog.create({ data: { businessName: "Manual email", email, status: "sent", subject: parsed.data.subject, body: parsed.data.body, sentAt: new Date() } });
            sent += 1;
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : "Unable to send email";
            await prisma.emailLog.create({ data: { businessName: "Manual email", email, status: "failed", subject: parsed.data.subject, body: parsed.data.body, errorMessage, sentAt: new Date() } });
            failed += 1;
          }
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "progress", completed: index + 1, total: uniqueRecipients.length, sent, failed, error: errorMessage })}\n`));
        }
        controller.close();
      }
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return fail("E-MANUAL-EMAIL-03", error instanceof Error ? error.message : "Invalid email request.", 400);
  }
}
