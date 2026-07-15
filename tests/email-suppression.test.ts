import { beforeEach, describe, expect, it, vi } from "vitest";

const doNotContactFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    doNotContact: { findMany: (...args: unknown[]) => doNotContactFindMany(...args) }
  }
}));

const { screenEmailRecipients } = await import("@/lib/email-suppression");

describe("email recipient screening", () => {
  beforeEach(() => doNotContactFindMany.mockReset().mockResolvedValue([]));

  it("normalizes and permits a valid email", async () => {
    const result = await screenEmailRecipients([{ id: 1, businessName: "Cafe", email: " SALES@Cafe.PH " }]);
    expect(result.sendable).toEqual([{ id: 1, businessName: "Cafe", email: "sales@cafe.ph" }]);
  });

  it("blocks an email opt-out before delivery", async () => {
    doNotContactFindMany.mockResolvedValue([{ normalizedContact: "sales@cafe.ph" }]);
    const result = await screenEmailRecipients([{ id: 1, businessName: "Cafe", email: "sales@cafe.ph" }]);
    expect(result.sendable).toHaveLength(0);
    expect(result.excluded[0]).toMatchObject({ reason: "DO_NOT_CONTACT" });
  });

  it("removes duplicate emails from the send batch", async () => {
    const result = await screenEmailRecipients([
      { id: 1, businessName: "Cafe A", email: "sales@cafe.ph" },
      { id: 2, businessName: "Cafe B", email: "SALES@CAFE.PH" }
    ]);
    expect(result.summary).toMatchObject({ sendable: 1, duplicate: 1 });
  });
});
