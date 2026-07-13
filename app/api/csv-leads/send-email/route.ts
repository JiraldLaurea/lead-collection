export const runtime = "nodejs";

import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { getEmailTemplateDefaultAttachment } from "@/lib/email-template";
import { fail } from "@/lib/http";
import { buildLeadEmailContent, sendLeadEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

const requestSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(5000),
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
    const leadIds = JSON.parse(String(formData.get("leadIds") || "[]"));
    const parsed = requestSchema.safeParse({ leadIds, subject: formData.get("subject"), body: formData.get("body") });
    if (!parsed.success) return fail("E-CSV-EMAIL-01", "Invalid email request.", 400, parsed.error.flatten());
    const files = formData.getAll("attachments").filter((item): item is File => item instanceof File);
    if (files.length > maxAttachmentCount) return fail("E-CSV-EMAIL-02", "Attach up to 5 files only.", 400);
    const uploadedAttachments = await Promise.all(files.map(async (file) => {
      if (file.size > maxAttachmentSize) throw new Error(`Attachment "${file.name}" is larger than 10MB.`);
      return { filename: file.name, content: Buffer.from(await file.arrayBuffer()), contentType: file.type || undefined };
    }));
    const defaultAttachment = await getEmailTemplateDefaultAttachment();
    const attachments = defaultAttachment ? [defaultAttachment, ...uploadedAttachments] : uploadedAttachments;
    const leads = await prisma.importedCsvLead.findMany({
      where: { id: { in: parsed.data.leadIds }, email: { not: null } },
      select: { id: true, businessName: true, email: true }
    });
    const recipients = leads.filter((lead): lead is typeof lead & { email: string } => Boolean(lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)));
    if (recipients.length === 0) return fail("E-CSV-EMAIL-03", "No selected leads have a valid email address.", 400);

    const debugSettings = await getDebugSettings();
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let sent = 0;
        let failed = 0;
        for (const [index, lead] of recipients.entries()) {
          let errorMessage: string | undefined;
          try {
            const sentEmail = debugSettings.emailDryRunEnabled
              ? buildLeadEmailContent({ businessName: lead.businessName, subjectTemplate: parsed.data.subject, bodyTemplate: parsed.data.body })
              : await sendLeadEmail({ businessName: lead.businessName, email: lead.email, subjectTemplate: parsed.data.subject, bodyTemplate: parsed.data.body, attachments });
            await prisma.emailLog.create({ data: { businessName: lead.businessName, email: lead.email, status: "sent", subject: sentEmail.subject, body: sentEmail.body, sentAt: new Date() } });
            sent += 1;
          } catch (error) {
            errorMessage = error instanceof Error ? error.message : "Unable to send email";
            await prisma.emailLog.create({ data: { businessName: lead.businessName, email: lead.email, status: "failed", subject: parsed.data.subject.replace(/\[business_name\]/gi, lead.businessName), body: parsed.data.body.replace(/\[business_name\]/gi, lead.businessName), errorMessage, sentAt: new Date() } });
            failed += 1;
          }
          controller.enqueue(encoder.encode(`${JSON.stringify({
            type: "progress",
            completed: index + 1,
            total: recipients.length,
            sent,
            failed,
            error: errorMessage
          })}\n`));
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
  } catch (error) {
    return fail("E-CSV-EMAIL-05", error instanceof Error ? error.message : "Invalid email request.", 400);
  }
}
