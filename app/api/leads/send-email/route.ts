import { z } from "zod";
import { getDebugSettings } from "@/lib/debug-settings";
import { fail, ok } from "@/lib/http";
import { getEmailTemplateDefaultAttachment } from "@/lib/email-template";
import { buildLeadEmailContent, sendLeadEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { screenEmailRecipients } from "@/lib/email-suppression";

const requestSchema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(50),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000)
});

const maxAttachmentCount = 5;
const maxAttachmentSize = 10 * 1024 * 1024;

async function parseEmailRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return {
      parsed: requestSchema.safeParse(await request.json()),
      attachments: []
    };
  }

  const formData = await request.formData();
  const leadIdsValue = formData.get("leadIds");
  const payload = {
    leadIds: typeof leadIdsValue === "string" ? JSON.parse(leadIdsValue) : [],
    subject: formData.get("subject"),
    body: formData.get("body")
  };
  const files = formData.getAll("attachments").filter((item): item is File => item instanceof File);
  if (files.length > maxAttachmentCount) {
    throw new Error(`Attach up to ${maxAttachmentCount} files only.`);
  }

  const attachments = await Promise.all(files.map(async (file) => {
    if (file.size > maxAttachmentSize) {
      throw new Error(`Attachment "${file.name}" is larger than 10MB.`);
    }

    return {
      filename: file.name,
      content: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || undefined
    };
  }));

  return {
    parsed: requestSchema.safeParse(payload),
    attachments
  };
}

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  let emailRequest: Awaited<ReturnType<typeof parseEmailRequest>>;
  try {
    emailRequest = await parseEmailRequest(request);
  } catch (error) {
    return fail("E-EMAIL-04", error instanceof Error ? error.message : "Invalid attachment request", 400);
  }

  const body = emailRequest.parsed;
  if (!body.success) return fail("E-EMAIL-01", "Invalid email request", 400, body.error.flatten());
  const defaultAttachment = await getEmailTemplateDefaultAttachment();
  const attachments = defaultAttachment ? [defaultAttachment, ...emailRequest.attachments] : emailRequest.attachments;

  const leads = await prisma.lead.findMany({
    where: {
      id: { in: body.data.leadIds },
      email: { not: null }
    },
    select: {
      id: true,
      businessName: true,
      email: true
    }
  });

  const screening = await screenEmailRecipients(leads);
  if (screening.sendable.length === 0) {
    return fail("E-EMAIL-02", "No selected leads have a contactable email address", 400, {
      screening: screening.summary,
      excluded: screening.excluded
    });
  }

  const debugSettings = await getDebugSettings();
  const results = [];
  for (const lead of screening.sendable) {
    try {
      const sentEmail = debugSettings.emailDryRunEnabled
        ? buildLeadEmailContent({
          businessName: lead.businessName,
          subjectTemplate: body.data.subject,
          bodyTemplate: body.data.body
        })
        : await sendLeadEmail({
        businessName: lead.businessName,
        email: lead.email,
        subjectTemplate: body.data.subject,
        bodyTemplate: body.data.body,
        attachments
      });
      await prisma.emailLog.create({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          status: "sent",
          subject: sentEmail.subject,
          body: sentEmail.body,
          sentAt: new Date()
        }
      });
      results.push({ id: lead.id, email: lead.email, sent: true });
    } catch (error) {
      await prisma.emailLog.create({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          status: "failed",
          subject: body.data.subject.replace(/\[business_name\]/gi, lead.businessName),
          body: body.data.body.replace(/\[business_name\]/gi, lead.businessName),
          errorMessage: error instanceof Error ? error.message : "Unable to send email",
          sentAt: new Date()
        }
      });
      results.push({
        id: lead.id,
        email: lead.email,
        sent: false,
        error: error instanceof Error ? error.message : "Unable to send email"
      });
    }
  }

  const sent = results.filter((result) => result.sent).length;
  const failed = results.length - sent;
  if (sent === 0) return fail("E-EMAIL-03", "Email sending failed", 500, results);

  return ok({ sent, failed, results, screening: screening.summary, excluded: screening.excluded });
}
