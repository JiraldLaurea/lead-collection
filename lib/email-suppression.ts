import { prisma } from "@/lib/prisma";

export type EmailRecipientInput = {
  id: number;
  businessName: string;
  email: string | null;
};

export type EmailExclusionReason = "MISSING_EMAIL" | "INVALID_EMAIL" | "DUPLICATE_IN_BATCH" | "DO_NOT_CONTACT";

export type EmailRecipientScreening = {
  sendable: (EmailRecipientInput & { email: string })[];
  excluded: (EmailRecipientInput & { reason: EmailExclusionReason })[];
  summary: {
    selected: number;
    sendable: number;
    missingEmail: number;
    invalidEmail: number;
    duplicate: number;
    doNotContact: number;
  };
};

const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || null;
}

/**
 * Server-side email suppression. This mirrors SMS screening so an opt-out cannot be
 * bypassed by directly calling an email API route.
 */
export async function screenEmailRecipients(recipients: EmailRecipientInput[]): Promise<EmailRecipientScreening> {
  const normalized = recipients.map((recipient) => ({ ...recipient, normalizedEmail: normalizeEmail(recipient.email) }));
  const emails = normalized
    .map((recipient) => recipient.normalizedEmail)
    .filter((email): email is string => Boolean(email && validEmail.test(email)));
  const suppressed = emails.length
    ? await prisma.doNotContact.findMany({
        where: { normalizedContact: { in: emails }, channel: "email", active: true },
        select: { normalizedContact: true }
      })
    : [];
  const doNotContact = new Set(suppressed.map((entry) => entry.normalizedContact));
  const seen = new Set<string>();
  const sendable: EmailRecipientScreening["sendable"] = [];
  const excluded: EmailRecipientScreening["excluded"] = [];

  for (const recipient of normalized) {
    const base = { id: recipient.id, businessName: recipient.businessName, email: recipient.email };
    if (!recipient.normalizedEmail) {
      excluded.push({ ...base, reason: "MISSING_EMAIL" });
    } else if (!validEmail.test(recipient.normalizedEmail)) {
      excluded.push({ ...base, reason: "INVALID_EMAIL" });
    } else if (doNotContact.has(recipient.normalizedEmail)) {
      excluded.push({ ...base, reason: "DO_NOT_CONTACT" });
    } else if (seen.has(recipient.normalizedEmail)) {
      excluded.push({ ...base, reason: "DUPLICATE_IN_BATCH" });
    } else {
      seen.add(recipient.normalizedEmail);
      sendable.push({ ...base, email: recipient.normalizedEmail });
    }
  }

  const count = (reason: EmailExclusionReason) => excluded.filter((item) => item.reason === reason).length;
  return {
    sendable,
    excluded,
    summary: {
      selected: recipients.length,
      sendable: sendable.length,
      missingEmail: count("MISSING_EMAIL"),
      invalidEmail: count("INVALID_EMAIL"),
      duplicate: count("DUPLICATE_IN_BATCH"),
      doNotContact: count("DO_NOT_CONTACT")
    }
  };
}
