import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appSetting: {
      findUnique: (...args: unknown[]) => findUnique(...args)
    }
  }
}));

const { isSmeSearchEnabled } = await import("../lib/feature-flags");

describe("SME Search feature flag", () => {
  beforeEach(() => {
    findUnique.mockReset();
    delete process.env.SME_SEARCH_ENABLED;
  });

  afterEach(() => {
    delete process.env.SME_SEARCH_ENABLED;
  });

  it("defaults to off when the setting has never been saved", async () => {
    findUnique.mockResolvedValue(null);
    await expect(isSmeSearchEnabled()).resolves.toBe(false);
  });

  it("is on when the saved setting is true", async () => {
    findUnique.mockResolvedValue({ key: "sme_search_enabled", value: "true" });
    await expect(isSmeSearchEnabled()).resolves.toBe(true);
  });

  it("is off when the saved setting is anything else", async () => {
    findUnique.mockResolvedValue({ key: "sme_search_enabled", value: "false" });
    await expect(isSmeSearchEnabled()).resolves.toBe(false);
  });

  it("lets the environment force the flag on without reading the database", async () => {
    process.env.SME_SEARCH_ENABLED = "true";
    await expect(isSmeSearchEnabled()).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("lets the environment force the flag off even when the setting is true", async () => {
    process.env.SME_SEARCH_ENABLED = "false";
    findUnique.mockResolvedValue({ key: "sme_search_enabled", value: "true" });
    await expect(isSmeSearchEnabled()).resolves.toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
