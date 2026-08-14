import { normalizePhilippineMobileNumber } from "@/lib/export";
import { prisma } from "@/lib/prisma";
import { isContactableClass } from "@/lib/sme/classify";
import type { ExcludedRecipient, ExclusionReason, ScreeningSummary } from "@/lib/sme/suppression-labels";

export type SmsRecipientInput = {
  id: number;
  businessName: string;
  phoneNumber: string | null;
  /** Present for SME profiles; unreviewed and excluded classes must never bulk-send. */
  classification?: string | null;
};

export type SmsRecipient = SmsRecipientInput & { phone: string };

export type RecipientScreening = {
  sendable: SmsRecipient[];
  excluded: ExcludedRecipient[];
  summary: ScreeningSummary;
};

/**
 * All actively suppressed SMS numbers. Used by the exports: a phone list handed to anyone
 * for outreach must not carry a number that has opted out (work order 12.5).
 */
export async function getSuppressedPhones() {
  const entries = await prisma.doNotContact.findMany({
    where: { channel: "sms", active: true },
    select: { normalizedContact: true }
  });
  return new Set(entries.map((entry) => entry.normalizedContact));
}

/**
 * Screens recipients before any SMS is sent (work order 8.2, 13.2).
 *
 * This runs on the server, inside the send route, not only in the UI — a suppression check
 * that lives only in the composer can be bypassed by calling the API directly, and the work
 * order treats bypassable opt-out as a non-acceptance condition.
 *
 * A carrier delivery receipt is recorded for audit purposes, but it is not an opt-out. A
 * temporary carrier rejection must not permanently prevent an operator from retrying a valid
 * number; only the explicit Do Not Contact register suppresses a recipient.
 */
export async function screenSmsRecipients(recipients: SmsRecipientInput[]): Promise<RecipientScreening> {
  const sendable: SmsRecipient[] = [];
  const excluded: ExcludedRecipient[] = [];

  const normalized = recipients.map((recipient) => ({
    ...recipient,
    phone: normalizePhilippineMobileNumber(recipient.phoneNumber)
  }));

  const phones = normalized
    .map((recipient) => recipient.phone)
    .filter((phone): phone is string => Boolean(phone));

  const suppressed = phones.length
    ? await prisma.doNotContact.findMany({
        where: { normalizedContact: { in: phones }, channel: "sms", active: true },
        select: { normalizedContact: true }
      })
    : [];

  const doNotContact = new Set(suppressed.map((entry) => entry.normalizedContact));
  const seen = new Set<string>();

  for (const recipient of normalized) {
    const base = { id: recipient.id, businessName: recipient.businessName, phoneNumber: recipient.phoneNumber };

    if (recipient.classification && !isContactableClass(recipient.classification)) {
      excluded.push({ ...base, reason: "CLASSIFICATION_NOT_APPROVED" });
      continue;
    }

    if (!recipient.phoneNumber?.trim()) {
      excluded.push({ ...base, reason: "MISSING_PHONE" });
      continue;
    }
    if (!recipient.phone) {
      excluded.push({ ...base, reason: "INVALID_NUMBER" });
      continue;
    }
    if (doNotContact.has(recipient.phone)) {
      excluded.push({ ...base, reason: "DO_NOT_CONTACT" });
      continue;
    }
    if (seen.has(recipient.phone)) {
      excluded.push({ ...base, reason: "DUPLICATE_IN_BATCH" });
      continue;
    }

    seen.add(recipient.phone);
    sendable.push({ ...base, phone: recipient.phone });
  }

  const count = (reason: ExclusionReason) => excluded.filter((item) => item.reason === reason).length;

  return {
    sendable,
    excluded,
    summary: {
      selected: recipients.length,
      sendable: sendable.length,
      missingPhone: count("MISSING_PHONE"),
      invalidNumber: count("INVALID_NUMBER"),
      requiresReview: count("CLASSIFICATION_NOT_APPROVED"),
      duplicate: count("DUPLICATE_IN_BATCH"),
      doNotContact: count("DO_NOT_CONTACT")
    }
  };
}
