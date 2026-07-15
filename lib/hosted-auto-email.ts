import { getDebugSettings } from "@/lib/debug-settings";
import { getEmailBodyTemplate, getEmailTemplateDefaultAttachment } from "@/lib/email-template";
import { discoverLeadEmail } from "@/lib/email-discovery";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { buildLeadEmailContent, sendLeadEmail, smtpConfigured } from "@/lib/mailer";
import { getOperationsSettings, isWithinAutoEmailSchedule } from "@/lib/operations-settings";
import { runPlacesSearch } from "@/lib/places";
import { fixedSearchCities, petClinicKeywords, skinClinicKeywords } from "@/lib/search-defaults";
import { prisma } from "@/lib/prisma";

export async function runScheduledAutoEmailCycle() {
  const settings = await getOperationsSettings();
  const sentToday = await countEmailsSentToday();
  if (!settings.autoEmailEnabled) return { processed: false, reason: "Automation is disabled." };
  if (!isWithinAutoEmailSchedule(settings)) return { processed: false, reason: "Outside the configured sending window." };
  if (sentToday >= settings.autoEmailDailyLimit) return { processed: false, reason: "Daily email limit reached." };

  const debugSettings = await getDebugSettings();
  if (!debugSettings.emailDryRunEnabled && !smtpConfigured()) {
    return { processed: false, reason: "SMTP is not configured." };
  }

  const search = scheduledSearchInput();
  const job = await runPlacesSearch(search);
  const candidates = await prisma.lead.findMany({
    where: {
      id: { in: job.savedLeadIds.length ? job.savedLeadIds : [-1] },
      emailLogs: { none: { status: "sent" } }
    },
    select: { id: true, businessName: true },
    take: 10,
    orderBy: { createdAt: "desc" }
  });

  const bodyTemplate = await getEmailBodyTemplate();
  const attachment = await getEmailTemplateDefaultAttachment();
  for (const candidate of candidates) {
    const discovery = await discoverLeadEmail(candidate.id);
    if (!discovery.email) continue;
    const lead = await prisma.lead.findUnique({ where: { id: candidate.id } });
    if (!lead?.email) continue;

    try {
      const content = debugSettings.emailDryRunEnabled
        ? buildLeadEmailContent({ businessName: lead.businessName, subjectTemplate: emailSubjectTemplate, bodyTemplate })
        : await sendLeadEmail({
          businessName: lead.businessName,
          email: lead.email,
          subjectTemplate: emailSubjectTemplate,
          bodyTemplate,
          attachments: attachment ? [attachment] : []
        });
      await prisma.emailLog.create({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          status: "sent",
          subject: content.subject,
          body: content.body,
          sentAt: new Date()
        }
      });
      return { processed: true, sent: true, leadId: lead.id };
    } catch (error) {
      await prisma.emailLog.create({
        data: {
          leadId: lead.id,
          businessName: lead.businessName,
          email: lead.email,
          status: "failed",
          subject: emailSubjectTemplate.replace(/\[business_name\]/gi, lead.businessName),
          body: bodyTemplate.replace(/\[business_name\]/gi, lead.businessName),
          errorMessage: error instanceof Error ? error.message : "Unable to send email",
          sentAt: new Date()
        }
      });
      return { processed: true, sent: false, leadId: lead.id };
    }
  }

  return { processed: true, sent: false, reason: "No emailable leads found." };
}

function scheduledSearchInput() {
  const slot = Math.floor(Date.now() / 3_600_000);
  const keywords = slot % 2 ? petClinicKeywords : skinClinicKeywords;
  return {
    country: "Philippines",
    cityArea: fixedSearchCities[slot % fixedSearchCities.length],
    keyword: keywords[slot % keywords.length],
    searchType: "TEXT_SEARCH" as const,
    maxResults: 30
  };
}

async function countEmailsSentToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.emailLog.count({ where: { status: "sent", sentAt: { gte: today } } });
}
