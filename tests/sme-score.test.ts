import { describe, expect, it } from "vitest";
import type { Classification } from "@/lib/sme/classify";
import { defaultScoreWeights, scoreBand, scoreLead, scoreModelVersion } from "@/lib/sme/score";
import { normalizeThresholds, normalizeWeights, parseWeights, weightsTotal } from "@/lib/sme/settings";

function classification(overrides: Partial<Classification> = {}): Classification {
  return {
    autoClass: "INDEPENDENT_SME",
    effectiveClass: "INDEPENDENT_SME",
    confidence: 65,
    reasons: [],
    branchCount: 1,
    matchedBrandId: null,
    matchedBrandName: null,
    ...overrides
  };
}

describe("score bands", () => {
  it("maps totals onto S/A/B/C/Low", () => {
    expect(scoreBand(100)).toBe("S");
    expect(scoreBand(80)).toBe("S");
    expect(scoreBand(79)).toBe("A");
    expect(scoreBand(65)).toBe("A");
    expect(scoreBand(64)).toBe("B");
    expect(scoreBand(50)).toBe("B");
    expect(scoreBand(49)).toBe("C");
    expect(scoreBand(35)).toBe("C");
    expect(scoreBand(34)).toBe("LOW");
    expect(scoreBand(0)).toBe("LOW");
  });
});

describe("lead scoring", () => {
  it("stamps every score with the model version", () => {
    const score = scoreLead({
      classification: classification(),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4.5,
      reviewCount: 100
    });
    expect(score.version).toBe(scoreModelVersion);
  });

  it("never exceeds 100", () => {
    const score = scoreLead({
      classification: classification({ confidence: 100, branchCount: 3, effectiveClass: "LOCAL_SME_CHAIN" }),
      phoneNumber: "09171234567",
      websiteUrl: "https://example.ph",
      rating: 5,
      reviewCount: 5000,
      zonePriority: "A+",
      categoryPriority: "A"
    });
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("gives an excluded franchise no score at all, not a flattering one", () => {
    // A Starbucks branch has a phone, a strong rating and an A-priority category, so the
    // non-SME factors would otherwise add up to a respectable "band B" — and it would sit in
    // the results looking like a prospect worth calling. It is not a lead, so it gets no score.
    const score = scoreLead({
      classification: classification({ effectiveClass: "FRANCHISE_EXCLUDED", confidence: 98 }),
      phoneNumber: "09171234567",
      websiteUrl: "https://starbucks.ph",
      rating: 4.5,
      reviewCount: 3000,
      zonePriority: "A+",
      categoryPriority: "A"
    });

    expect(score.total).toBe(0);
    expect(score.band).toBe("LOW");
    expect(score.factors.every((factor) => factor.points === 0)).toBe(true);
    expect(score.factors[0].evidence.join(" ")).toContain("Override the classification");
  });

  it("also refuses to score a large chain or a manual exclusion", () => {
    for (const effectiveClass of ["LARGE_CHAIN", "MANUAL_EXCLUDE"] as const) {
      const score = scoreLead({
        classification: classification({ effectiveClass }),
        phoneNumber: "09171234567",
        websiteUrl: null,
        rating: 5,
        reviewCount: 1000,
        zonePriority: "A+"
      });
      expect(score.total).toBe(0);
    }
  });

  it("still scores a business awaiting manual review: it may yet be a prospect", () => {
    const score = scoreLead({
      classification: classification({ effectiveClass: "MANUAL_REVIEW", confidence: 50, branchCount: 7 }),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4.5,
      reviewCount: 200,
      zonePriority: "A"
    });
    expect(score.total).toBeGreaterThan(0);
  });

  it("treats a local chain as nearly as attractive as an independent", () => {
    const independent = scoreLead({
      classification: classification({ effectiveClass: "INDEPENDENT_SME", confidence: 80 }),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4.5,
      reviewCount: 100
    });
    const chain = scoreLead({
      classification: classification({ effectiveClass: "LOCAL_SME_CHAIN", confidence: 80, branchCount: 3 }),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4.5,
      reviewCount: 100
    });

    // The work order is explicit: a locally controlled multi-branch SME is a top prospect.
    expect(chain.total).toBeGreaterThanOrEqual(independent.total - 2);
  });

  describe("marketing need — the honesty rule", () => {
    it("scores maximum need when no website exists at all", () => {
      const score = scoreLead({
        classification: classification(),
        phoneNumber: "09171234567",
        websiteUrl: null,
        rating: 4,
        reviewCount: 50
      });
      const need = score.factors.find((factor) => factor.key === "marketingNeed");

      expect(need?.points).toBe(25);
      expect(need?.unknown).toBe(false);
      expect(need?.evidence[0]).toContain("No website");
    });

    it("scores high need when the only presence is a Facebook page", () => {
      const score = scoreLead({
        classification: classification(),
        phoneNumber: "09171234567",
        websiteUrl: "https://facebook.com/aguirrecafe",
        rating: 4,
        reviewCount: 50
      });
      const need = score.factors.find((factor) => factor.key === "marketingNeed");

      expect(need!.points).toBeGreaterThan(15);
      expect(need?.evidence[0]).toContain("not an owned website");
    });

    it("marks marketing need UNKNOWN — never weak — when the business has a real site", () => {
      // We do not collect social or content data, so we must not claim the marketing is poor.
      // Missing evidence stays unknown, per the work order.
      const score = scoreLead({
        classification: classification(),
        phoneNumber: "09171234567",
        websiteUrl: "https://aguirregarden.ph",
        rating: 4,
        reviewCount: 50
      });
      const need = score.factors.find((factor) => factor.key === "marketingNeed");

      expect(need?.unknown).toBe(true);
      expect(need!.points).toBeLessThan(25);
      expect(need!.evidence.join(" ")).toContain("NOT been assessed");
    });

    it("never claims a social account is inactive", () => {
      const score = scoreLead({
        classification: classification(),
        phoneNumber: null,
        websiteUrl: "https://instagram.com/cafe",
        rating: null,
        reviewCount: null
      });
      const text = score.factors.flatMap((factor) => factor.evidence).join(" ").toLowerCase();

      expect(text).not.toContain("inactive");
      expect(text).not.toContain("rarely posts");
    });
  });

  it("marks commercial area value unknown outside a configured zone", () => {
    const score = scoreLead({
      classification: classification(),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4,
      reviewCount: 50
    });
    const area = score.factors.find((factor) => factor.key === "areaValue");

    expect(area?.unknown).toBe(true);
    expect(area?.points).toBe(0);
    expect(area?.evidence[0]).toContain("unknown");
  });

  it("rewards an A+ commercial zone", () => {
    const score = scoreLead({
      classification: classification(),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4,
      reviewCount: 50,
      zonePriority: "A+"
    });
    expect(score.factors.find((factor) => factor.key === "areaValue")?.points).toBe(10);
  });

  it("weights a phone above a website: SMS is the channel this app uses", () => {
    const phoneOnly = scoreLead({
      classification: classification(),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: null,
      reviewCount: null
    });
    const webOnly = scoreLead({
      classification: classification(),
      phoneNumber: null,
      websiteUrl: "https://example.ph",
      rating: null,
      reviewCount: null
    });

    const phonePoints = phoneOnly.factors.find((f) => f.key === "contactAvailability")!.points;
    const webPoints = webOnly.factors.find((f) => f.key === "contactAvailability")!.points;
    expect(phonePoints).toBeGreaterThan(webPoints);
  });

  it("is reproducible: same inputs and version give the same score", () => {
    const input = {
      classification: classification(),
      phoneNumber: "09171234567",
      websiteUrl: null,
      rating: 4.5,
      reviewCount: 120,
      zonePriority: "A",
      categoryPriority: "A"
    };
    expect(scoreLead(input).total).toBe(scoreLead(input).total);
  });

  it("honors custom weights", () => {
    const zeroed = scoreLead(
      {
        classification: classification(),
        phoneNumber: "09171234567",
        websiteUrl: null,
        rating: 4,
        reviewCount: 50
      },
      { ...defaultScoreWeights, marketingNeed: 0, smeConfidence: 50 }
    );
    expect(zeroed.factors.find((factor) => factor.key === "marketingNeed")?.points).toBe(0);
  });
});

describe("SME settings", () => {
  it("defaults the weights to the work order's 25/25/20/20/10", () => {
    expect(weightsTotal(defaultScoreWeights)).toBe(100);
    expect(defaultScoreWeights).toMatchObject({
      smeConfidence: 25,
      marketingNeed: 25,
      businessPotential: 20,
      contactAvailability: 20,
      areaValue: 10
    });
  });

  it("falls back to defaults on unparseable settings", () => {
    expect(parseWeights("not json")).toEqual(defaultScoreWeights);
    expect(parseWeights(null)).toEqual(defaultScoreWeights);
  });

  it("clamps out-of-range weights", () => {
    const weights = normalizeWeights({
      smeConfidence: -10,
      marketingNeed: 500,
      businessPotential: 20,
      contactAvailability: 20,
      areaValue: 10
    });
    expect(weights.smeConfidence).toBe(0);
    expect(weights.marketingNeed).toBe(100);
  });

  it("stops the manual-review ceiling falling below the local-chain ceiling", () => {
    // Otherwise the manual-review band vanishes and chains skip straight to exclusion.
    const thresholds = normalizeThresholds({ localChainMax: 8, manualReviewMax: 3 });
    expect(thresholds.manualReviewMax).toBeGreaterThanOrEqual(thresholds.localChainMax);
  });
});
