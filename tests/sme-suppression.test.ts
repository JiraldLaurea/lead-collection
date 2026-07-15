import { beforeEach, describe, expect, it, vi } from "vitest";

const doNotContactFindMany = vi.fn();
const smsLogFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    doNotContact: { findMany: (...args: unknown[]) => doNotContactFindMany(...args) },
    smsLog: { findMany: (...args: unknown[]) => smsLogFindMany(...args) }
  }
}));

const { screenSmsRecipients } = await import("@/lib/sme/suppression");

function lead(id: number, businessName: string, phoneNumber: string | null) {
  return { id, businessName, phoneNumber };
}

describe("SMS recipient screening", () => {
  beforeEach(() => {
    doNotContactFindMany.mockReset().mockResolvedValue([]);
    smsLogFindMany.mockReset().mockResolvedValue([]);
  });

  it("passes a valid recipient through", async () => {
    const result = await screenSmsRecipients([lead(1, "Aguirre Cafe", "0917 156 8299")]);

    expect(result.sendable).toHaveLength(1);
    expect(result.sendable[0].phone).toBe("639171568299");
    expect(result.excluded).toHaveLength(0);
  });

  it("excludes a lead with no phone number", async () => {
    const result = await screenSmsRecipients([lead(1, "No Phone Cafe", null)]);

    expect(result.sendable).toHaveLength(0);
    expect(result.excluded[0]).toMatchObject({ reason: "MISSING_PHONE" });
    expect(result.summary.missingPhone).toBe(1);
  });

  it("excludes a landline, which is not a mobile number", async () => {
    const result = await screenSmsRecipients([lead(1, "Landline Cafe", "(02) 8260 8934")]);

    expect(result.sendable).toHaveLength(0);
    expect(result.excluded[0]).toMatchObject({ reason: "INVALID_NUMBER" });
  });

  it("blocks a number on the Do Not Contact list", async () => {
    doNotContactFindMany.mockResolvedValue([{ normalizedContact: "639171568299" }]);

    const result = await screenSmsRecipients([lead(1, "Opted Out Cafe", "0917 156 8299")]);

    expect(result.sendable).toHaveLength(0);
    expect(result.excluded[0]).toMatchObject({ reason: "DO_NOT_CONTACT" });
    expect(result.summary.doNotContact).toBe(1);
  });

  it("blocks a number that previously hard-failed", async () => {
    // A carrier-confirmed undeliverable number stays undeliverable; resending burns credits.
    smsLogFindMany.mockResolvedValue([{ phone: "639171568299" }]);

    const result = await screenSmsRecipients([lead(1, "Dead Number Cafe", "09171568299")]);

    expect(result.sendable).toHaveLength(0);
    expect(result.excluded[0]).toMatchObject({ reason: "PREVIOUSLY_FAILED" });
  });

  it("blocks an SME that is still awaiting classification review", async () => {
    const result = await screenSmsRecipients([
      { ...lead(1, "Review Cafe", "09171568299"), classification: "MANUAL_REVIEW" }
    ]);

    expect(result.sendable).toHaveLength(0);
    expect(result.excluded[0]).toMatchObject({ reason: "CLASSIFICATION_NOT_APPROVED" });
    expect(result.summary.requiresReview).toBe(1);
  });

  it("allows an explicitly approved SME classification", async () => {
    const result = await screenSmsRecipients([
      { ...lead(1, "Independent Cafe", "09171568299"), classification: "INDEPENDENT_SME" }
    ]);

    expect(result.sendable).toHaveLength(1);
  });

  it("collapses the same number appearing twice in one batch", async () => {
    const result = await screenSmsRecipients([
      lead(1, "Cafe One", "0917 156 8299"),
      lead(2, "Cafe One (2nd listing)", "+639171568299")
    ]);

    expect(result.sendable).toHaveLength(1);
    expect(result.excluded[0]).toMatchObject({ reason: "DUPLICATE_IN_BATCH" });
    expect(result.summary.duplicate).toBe(1);
  });

  it("reports a full summary across mixed recipients", async () => {
    doNotContactFindMany.mockResolvedValue([{ normalizedContact: "639998887777" }]);

    const result = await screenSmsRecipients([
      lead(1, "Good One", "09171568299"),
      lead(2, "Good Two", "09209876543"),
      lead(3, "No Phone", null),
      lead(4, "Landline", "(02) 8260 8934"),
      lead(5, "Opted Out", "09998887777"),
      lead(6, "Duplicate", "0917 156 8299")
    ]);

    expect(result.summary).toMatchObject({
      selected: 6,
      sendable: 2,
      missingPhone: 1,
      invalidNumber: 1,
      duplicate: 1,
      doNotContact: 1
    });
    expect(result.sendable.map((r) => r.businessName)).toEqual(["Good One", "Good Two"]);
  });

  it("does not query suppression tables when no number is usable", async () => {
    await screenSmsRecipients([lead(1, "No Phone", null)]);
    expect(doNotContactFindMany).not.toHaveBeenCalled();
    expect(smsLogFindMany).not.toHaveBeenCalled();
  });

  it("behaves exactly as before when nothing is suppressed", async () => {
    // The regression guarantee: an empty DNC list means today's behavior is unchanged.
    const result = await screenSmsRecipients([
      lead(1, "A", "09171111111"),
      lead(2, "B", "09172222222")
    ]);

    expect(result.sendable).toHaveLength(2);
    expect(result.excluded).toHaveLength(0);
  });
});
