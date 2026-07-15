import { getDebugSettings } from "@/lib/debug-settings";
import { getEmailTemplateDefaultAttachment } from "@/lib/email-template";
import { screenEmailRecipients, type EmailRecipientScreening } from "@/lib/email-suppression";
import { buildLeadEmailContent, sendLeadEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { buildLeadSmsBody, sendSmsBatch, type SmsResult } from "@/lib/sms";
import { screenSmsRecipients } from "@/lib/sme/suppression";
import type { ExcludedRecipient, ScreeningSummary } from "@/lib/sme/suppression-labels";

/**
 * Shared SME outreach send + log path.
 *
 * The manual composer routes ([send-sms], [send-email]) and the automatic outreach engine
 * ([lib/auto-outreach.ts]) both send from captured SME profiles. The screening, provider send,
 * logging (SmsLog/EmailLog), activity trail (ContactActivity) and CONTACTED transition all live
 * here so the two callers cannot drift apart.
 */

export type SmsSendRecord = {
  businessId: number;
  businessName: string;
  phone: string;
  sent: boolean;
  error?: string;
  providerMessageId: string | null;
  body: string;
};

export type SmeSmsOutcome = {
  sent: number;
  failed: number;
  sendableCount: number;
  results: SmsSendRecord[];
  screening: ScreeningSummary;
  excluded: ExcludedRecipient[];
};

/** Screens, sends and logs SMS for the given SME business profiles. Behavior matches the manual route. */
export async function sendSmeSms(businessIds: number[], body: string): Promise<SmeSmsOutcome> {
  const businesses = await prisma.smeBusinessProfile.findMany({
    where: { id: { in: businessIds } },
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
    return { sent: 0, failed: 0, sendableCount: 0, results: [], screening: screening.summary, excluded: screening.excluded };
  }

  const debugSettings = await getDebugSettings();
  const provider = process.env.SMS_PROVIDER ?? "mock";
  const messages = screening.sendable.map((business) => ({
    phone: business.phone,
    message: buildLeadSmsBody(body, business.businessName)
  }));
  const sendResults: SmsResult[] = debugSettings.smsDryRunEnabled
    ? messages.map(() => ({ success: true, provider_message_id: `dryrun_${Date.now()}` }))
    : await sendSmsBatch(messages);

  const sentAt = new Date();
  const results: SmsSendRecord[] = screening.sendable.map((business, index) => {
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
    }),
    prisma.smeBusinessProfile.updateMany({
      where: { id: { in: results.filter((result) => result.sent).map((result) => result.businessId) } },
      data: { leadStatus: "CONTACTED" }
    })
  ]);

  const sent = results.filter((result) => result.sent).length;
  return {
    sent,
    failed: results.length - sent,
    sendableCount: screening.sendable.length,
    results,
    screening: screening.summary,
    excluded: screening.excluded
  };
}

export type EmailSendRecord = {
  businessId: number;
  businessName: string;
  email: string;
  sent: boolean;
  error?: string;
};

export type SmeEmailOutcome = {
  sent: number;
  failed: number;
  sendableCount: number;
  results: EmailSendRecord[];
  screening: EmailRecipientScreening["summary"];
  excluded: EmailRecipientScreening["excluded"];
};

/** Screens, sends and logs email for the given SME business profiles. Behavior matches the manual route. */
export async function sendSmeEmail(businessIds: number[], subject: string, body: string): Promise<SmeEmailOutcome> {
  const businesses = await prisma.smeBusinessProfile.findMany({
    where: { id: { in: businessIds } },
    select: { id: true, leadId: true, displayName: true, email: true }
  });
  const screening = await screenEmailRecipients(
    businesses.map((business) => ({ id: business.id, businessName: business.displayName, email: business.email }))
  );
  if (screening.sendable.length === 0) {
    return { sent: 0, failed: 0, sendableCount: 0, results: [], screening: screening.summary, excluded: screening.excluded };
  }

  const businessById = new Map(businesses.map((business) => [business.id, business]));
  const debugSettings = await getDebugSettings();
  const defaultAttachment = await getEmailTemplateDefaultAttachment();
  const attachments = defaultAttachment ? [defaultAttachment] : [];
  const sentAt = new Date();
  const results: EmailSendRecord[] = [];

  for (const recipient of screening.sendable) {
    const business = businessById.get(recipient.id)!;
    try {
      const content = debugSettings.emailDryRunEnabled
        ? buildLeadEmailContent({ businessName: recipient.businessName, subjectTemplate: subject, bodyTemplate: body })
        : await sendLeadEmail({
            businessName: recipient.businessName,
            email: recipient.email,
            subjectTemplate: subject,
            bodyTemplate: body,
            attachments
          });
      await prisma.$transaction([
        prisma.emailLog.create({
          data: {
            leadId: business.leadId,
            businessName: recipient.businessName,
            email: recipient.email,
            status: "sent",
            subject: content.subject,
            body: content.body,
            sentAt
          }
        }),
        prisma.contactActivity.create({
          data: {
            leadId: business.leadId,
            businessId: business.id,
            type: "EMAIL",
            channel: "email",
            status: "sent",
            metadata: JSON.stringify({ email: recipient.email })
          }
        }),
        prisma.smeBusinessProfile.update({ where: { id: business.id }, data: { leadStatus: "CONTACTED" } })
      ]);
      results.push({ businessId: business.id, businessName: recipient.businessName, email: recipient.email, sent: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to send email";
      await prisma.$transaction([
        prisma.emailLog.create({
          data: {
            leadId: business.leadId,
            businessName: recipient.businessName,
            email: recipient.email,
            status: "failed",
            subject: subject.replace(/\[business_name\]/gi, recipient.businessName),
            body: body.replace(/\[business_name\]/gi, recipient.businessName),
            errorMessage,
            sentAt
          }
        }),
        prisma.contactActivity.create({
          data: {
            leadId: business.leadId,
            businessId: business.id,
            type: "EMAIL",
            channel: "email",
            status: "failed",
            metadata: JSON.stringify({ email: recipient.email, error: errorMessage })
          }
        })
      ]);
      results.push({ businessId: business.id, businessName: recipient.businessName, email: recipient.email, sent: false, error: errorMessage });
    }
  }

  const sent = results.filter((result) => result.sent).length;
  return {
    sent,
    failed: results.length - sent,
    sendableCount: screening.sendable.length,
    results,
    screening: screening.summary,
    excluded: screening.excluded
  };
}
