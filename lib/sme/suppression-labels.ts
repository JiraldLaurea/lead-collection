/**
 * Client-safe half of the suppression module.
 *
 * The composer needs these labels and types, but `lib/sme/suppression.ts` imports Prisma.
 * Importing from there in a client component drags the whole database client into the
 * browser bundle, so the shared, dependency-free parts live here.
 */
export type ExclusionReason =
  | "MISSING_PHONE"
  | "INVALID_NUMBER"
  | "CLASSIFICATION_NOT_APPROVED"
  | "DUPLICATE_IN_BATCH"
  | "DO_NOT_CONTACT";

export type ExcludedRecipient = {
  id: number;
  businessName: string;
  phoneNumber: string | null;
  reason: ExclusionReason;
};

export type ScreeningSummary = {
  selected: number;
  sendable: number;
  missingPhone: number;
  invalidNumber: number;
  requiresReview: number;
  duplicate: number;
  doNotContact: number;
};

export const exclusionLabels: Record<ExclusionReason, string> = {
  MISSING_PHONE: "No phone number",
  INVALID_NUMBER: "Not a valid PH mobile number",
  CLASSIFICATION_NOT_APPROVED: "SME classification requires review",
  DUPLICATE_IN_BATCH: "Duplicate number in this batch",
  DO_NOT_CONTACT: "On the Do Not Contact list"
};
