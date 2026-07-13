import { describe, expect, it } from "vitest";
import { applyManualOverride, classifyCandidates, isContactableClass, resolveBrandAliases } from "@/lib/sme/classify";
import { dedupeCandidates, distanceMeters } from "@/lib/sme/dedupe";
import { matchFranchise, toFranchiseRule } from "@/lib/sme/franchise";
import { splitBusinessName } from "@/lib/sme/normalize-name";
import { brandDomain, isSharedDomain } from "@/lib/sme/shared-domains";
import type { BusinessCandidate } from "@/lib/sme/types";

function candidate(overrides: Partial<BusinessCandidate> & { displayName: string }): BusinessCandidate {
  return {
    providerPlaceId: overrides.providerPlaceId ?? `ChIJ_${overrides.displayName.replace(/\W+/g, "_")}`,
    displayName: overrides.displayName,
    formattedAddress: overrides.formattedAddress ?? null,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    primaryType: overrides.primaryType ?? "cafe",
    types: overrides.types ?? ["cafe"],
    businessStatus: overrides.businessStatus ?? "OPERATIONAL",
    googleMapsUri: null,
    phoneNumber: overrides.phoneNumber ?? null,
    websiteUrl: overrides.websiteUrl ?? null,
    rating: overrides.rating ?? null,
    userRatingCount: overrides.userRatingCount ?? null,
    detailsFetched: true,
    fetchedAt: new Date()
  };
}

const rules = [
  toFranchiseRule({ id: 1, canonicalName: "McDonald's", aliases: "McDonalds;McDo", officialDomains: "mcdonalds.com.ph" }),
  toFranchiseRule({ id: 2, canonicalName: "Jollibee", officialDomains: "jollibee.com.ph" }),
  toFranchiseRule({ id: 3, canonicalName: "Bo's Coffee", aliases: "Bos Coffee", officialDomains: "boscoffee.com" }),
  toFranchiseRule({ id: 4, canonicalName: "Bench", officialDomains: "bench.com.ph" }),
  toFranchiseRule({ id: 5, canonicalName: "Starbucks", aliases: "Starbucks Coffee" })
];

describe("business name splitting", () => {
  it("splits an explicit separator into brand and branch", () => {
    expect(splitBusinessName("ABC Café - BGC High Street Branch")).toMatchObject({
      brandCandidateName: "abc cafe",
      branchLabel: "bgc high street"
    });
  });

  it("peels a trailing city name off the brand", () => {
    expect(splitBusinessName("ABC CAFE MAKATI")).toMatchObject({
      brandCandidateName: "abc cafe",
      branchLabel: "makati"
    });
  });

  it("keeps the full name available alongside the split", () => {
    expect(splitBusinessName("ABC Cafe Makati").normalizedName).toBe("abc cafe makati");
  });

  it("does not strip a location word that IS the brand", () => {
    // "Makati Supermarket" is a brand, not a branch of "Supermarket".
    expect(splitBusinessName("Makati Supermarket").brandCandidateName).toBe("makati supermarket");
  });

  it("never strips the name down to nothing", () => {
    expect(splitBusinessName("Makati").brandCandidateName).toBe("makati");
    expect(splitBusinessName("SM").brandCandidateName).toBe("sm");
  });

  it("removes branch markers only as whole tokens", () => {
    expect(splitBusinessName("Kopi Store Ortigas").brandCandidateName).toBe("kopi");
    // "Outlet Shoes" keeps its identity: "outlet" is not a trailing token here.
    expect(splitBusinessName("Outlet Shoes").brandCandidateName).toBe("outlet shoes");
  });
});

describe("shared domains", () => {
  it("treats social and link-in-bio hosts as shared", () => {
    for (const host of ["facebook.com", "www.facebook.com", "instagram.com", "linktr.ee", "m.me", "shopee.ph"]) {
      expect(isSharedDomain(host)).toBe(true);
      expect(brandDomain(host)).toBeNull();
    }
  });

  it("treats rented platform subdomains as shared", () => {
    expect(isSharedDomain("abccafe.wixsite.com")).toBe(true);
    expect(isSharedDomain("abccafe.business.site")).toBe(true);
  });

  it("accepts a genuine owned domain", () => {
    expect(isSharedDomain("aguirregarden.ph")).toBe(false);
    expect(brandDomain("www.AguirreGarden.ph")).toBe("aguirregarden.ph");
  });
});

describe("franchise matching", () => {
  it("matches on an official domain with the highest confidence", () => {
    const match = matchFranchise({ displayName: "Some Store", websiteHost: "mcdonalds.com.ph" }, rules);
    expect(match).toMatchObject({ canonicalName: "McDonald's", matchedOn: "DOMAIN", confidence: 98 });
  });

  it("matches a subdomain of an official domain", () => {
    const match = matchFranchise({ displayName: "Some Store", websiteHost: "order.jollibee.com.ph" }, rules);
    expect(match?.canonicalName).toBe("Jollibee");
  });

  it("matches an exact name and an alias", () => {
    expect(matchFranchise({ displayName: "McDonald's" }, rules)?.canonicalName).toBe("McDonald's");
    expect(matchFranchise({ displayName: "McDo" }, rules)?.canonicalName).toBe("McDonald's");
    expect(matchFranchise({ displayName: "MCDONALDS" }, rules)?.canonicalName).toBe("McDonald's");
  });

  it("matches after stripping a branch suffix, with lower confidence", () => {
    const match = matchFranchise({ displayName: "Starbucks Coffee Greenbelt" }, rules);
    expect(match).toMatchObject({ canonicalName: "Starbucks", matchedOn: "BRAND_CANDIDATE", confidence: 80 });
  });

  // The false positives that would wrongly exclude a real prospect.
  it("does NOT match a different business whose name merely contains a brand", () => {
    expect(matchFranchise({ displayName: "Bobby's Coffee House" }, rules)).toBeNull();
    expect(matchFranchise({ displayName: "Benchmark Fitness" }, rules)).toBeNull();
    expect(matchFranchise({ displayName: "Old McDonald's Farm Supply" }, rules)).toBeNull();
  });

  it("does NOT treat a Facebook page as a franchise domain", () => {
    expect(matchFranchise({ displayName: "Aguirre Garden Cafe", websiteHost: "facebook.com" }, rules)).toBeNull();
  });

  it("ignores an inactive rule", () => {
    const inactive = [{ ...toFranchiseRule({ id: 9, canonicalName: "Jollibee" }), active: false }];
    expect(matchFranchise({ displayName: "Jollibee" }, inactive)).toBeNull();
  });
});

describe("SME classification", () => {
  it("excludes a known franchise with a visible reason", () => {
    const result = classifyCandidates([candidate({ displayName: "Jollibee BGC" })], rules);
    const classification = result.get("ChIJ_Jollibee_BGC");

    expect(classification?.effectiveClass).toBe("FRANCHISE_EXCLUDED");
    expect(classification?.matchedBrandName).toBe("Jollibee");
    expect(classification?.reasons[0].detail).toContain("Jollibee");
  });

  it("keeps a single-location business as an independent SME", () => {
    const result = classifyCandidates([candidate({ displayName: "Aguirre Garden Cafe" })], rules);
    expect(result.get("ChIJ_Aguirre_Garden_Cafe")).toMatchObject({
      effectiveClass: "INDEPENDENT_SME",
      branchCount: 1
    });
  });

  it("keeps a 3-branch local business as a LOCAL_SME_CHAIN, not a franchise", () => {
    const result = classifyCandidates(
      [
        candidate({ displayName: "Kopi Roasters Makati", providerPlaceId: "p1" }),
        candidate({ displayName: "Kopi Roasters BGC", providerPlaceId: "p2" }),
        candidate({ displayName: "Kopi Roasters Ortigas", providerPlaceId: "p3" })
      ],
      rules
    );

    const classification = result.get("p1");
    expect(classification?.effectiveClass).toBe("LOCAL_SME_CHAIN");
    expect(classification?.branchCount).toBe(3);
    expect(isContactableClass(classification!.effectiveClass)).toBe(true);
    expect(classification?.reasons.some((reason) => reason.code === "LOCAL_CHAIN_RETAINED")).toBe(true);
  });

  it("routes a 7-location business to MANUAL_REVIEW", () => {
    const candidates = Array.from({ length: 7 }, (_, index) =>
      candidate({ displayName: `Grind House ${index}`, providerPlaceId: `p${index}` })
    ).map((item, index) => ({ ...item, displayName: `Grind House ${["Makati", "BGC", "Ortigas", "Cubao", "Pasig", "Timog", "Alabang"][index]}` }));

    const result = classifyCandidates(candidates, rules);
    const classification = result.get("p0");

    expect(classification?.branchCount).toBe(7);
    expect(classification?.effectiveClass).toBe("MANUAL_REVIEW");
    // Manual review must not be bulk-contactable until a human looks at it.
    expect(isContactableClass(classification!.effectiveClass)).toBe(false);
  });

  it("classifies 10+ observed locations as a LARGE_CHAIN", () => {
    const cities = ["Makati", "BGC", "Ortigas", "Cubao", "Pasig", "Timog", "Alabang", "Manila", "Pasay", "Marikina"];
    const candidates = cities.map((city, index) =>
      candidate({ displayName: `Mega Brew ${city}`, providerPlaceId: `p${index}` })
    );

    const result = classifyCandidates(candidates, rules);
    expect(result.get("p0")).toMatchObject({ effectiveClass: "LARGE_CHAIN", branchCount: 10 });
  });

  it("does NOT cluster independent cafes that all use facebook.com as a website", () => {
    // The live failure mode: three unrelated BF Homes cafes whose only web presence is Facebook.
    const result = classifyCandidates(
      [
        candidate({ displayName: "The Origin Kopitiam", providerPlaceId: "p1", websiteUrl: "https://www.facebook.com/theoriginkopitiam" }),
        candidate({ displayName: "A & S Cafe", providerPlaceId: "p2", websiteUrl: "https://www.instagram.com/anscafe.co/" }),
        candidate({ displayName: "MK Cafe", providerPlaceId: "p3", websiteUrl: "http://www.facebook.com/mkcafebf" })
      ],
      rules
    );

    for (const placeId of ["p1", "p2", "p3"]) {
      const classification = result.get(placeId);
      expect(classification?.effectiveClass).toBe("INDEPENDENT_SME");
      expect(classification?.branchCount).toBe(1);
      expect(classification?.reasons.some((reason) => reason.code === "NO_OWNED_DOMAIN")).toBe(true);
    }
  });

  it("does cluster locations that share a genuine owned domain", () => {
    const result = classifyCandidates(
      [
        candidate({ displayName: "Brew Lab Makati", providerPlaceId: "p1", websiteUrl: "https://brewlab.ph" }),
        candidate({ displayName: "Brew Lab BGC", providerPlaceId: "p2", websiteUrl: "https://brewlab.ph/bgc" })
      ],
      rules
    );

    const classification = result.get("p1");
    expect(classification?.effectiveClass).toBe("LOCAL_SME_CHAIN");
    expect(classification?.reasons.some((reason) => reason.code === "SHARED_BRAND_DOMAIN")).toBe(true);
  });

  it("folds in branch counts from previous searches", () => {
    const result = classifyCandidates([candidate({ displayName: "Kopi Roasters Makati", providerPlaceId: "p1" })], rules, {
      priorBranchCounts: new Map([["kopi roasters", 4]])
    });

    // Seen once here, but four are already known: it is a chain, not an independent SME.
    expect(result.get("p1")).toMatchObject({ effectiveClass: "LOCAL_SME_CHAIN", branchCount: 4 });
  });

  it("honors configurable thresholds", () => {
    const candidates = ["Makati", "BGC", "Ortigas"].map((city, index) =>
      candidate({ displayName: `Tight Brew ${city}`, providerPlaceId: `p${index}` })
    );

    const result = classifyCandidates(candidates, rules, {
      thresholds: { localChainMax: 2, manualReviewMax: 4 }
    });
    expect(result.get("p0")?.effectiveClass).toBe("MANUAL_REVIEW");
  });

  it("reports low confidence for a single location, since we only see what we searched", () => {
    const result = classifyCandidates([candidate({ displayName: "Solo Cafe" })], rules);
    const classification = result.get("ChIJ_Solo_Cafe");
    expect(classification!.confidence).toBeLessThan(70);
    expect(classification?.reasons.some((reason) => reason.code === "SINGLE_OBSERVED_LOCATION")).toBe(true);
  });
});

describe("brand alias resolution (prefix collapsing)", () => {
  it("collapses a brand onto the shorter name it extends", () => {
    const aliases = resolveBrandAliases(["nihon cafe", "nihon cafe bel air"]);
    expect(aliases.get("nihon cafe bel air")).toBe("nihon cafe");
    expect(aliases.get("nihon cafe")).toBe("nihon cafe");
  });

  it("does NOT merge two brands that merely share a prefix", () => {
    // Neither is a complete prefix of the other, so these stay separate.
    const aliases = resolveBrandAliases(["cafe de lipa", "cafe de manila"]);
    expect(aliases.get("cafe de lipa")).toBe("cafe de lipa");
    expect(aliases.get("cafe de manila")).toBe("cafe de manila");
  });

  it("refuses to let a single generic token swallow everything", () => {
    const aliases = resolveBrandAliases(["cafe", "cafe roma", "cafe lupe"]);
    expect(aliases.get("cafe roma")).toBe("cafe roma");
    expect(aliases.get("cafe lupe")).toBe("cafe lupe");
  });

  it("catches the real Makati case that suffix stripping missed", () => {
    const result = classifyCandidates(
      [
        candidate({ displayName: "Nihon Cafe - Concept", providerPlaceId: "p1" }),
        candidate({ displayName: "Nihon Cafe Bel Air", providerPlaceId: "p2" })
      ],
      rules
    );

    // "Bel Air" is a Makati barangay, not in any location-suffix list.
    expect(result.get("p1")).toMatchObject({ effectiveClass: "LOCAL_SME_CHAIN", branchCount: 2 });
    expect(result.get("p2")).toMatchObject({ effectiveClass: "LOCAL_SME_CHAIN", branchCount: 2 });
  });

  it("still keeps genuinely different brands apart", () => {
    // Real Makati results: "Panco Cafe" and "Pancho Cafe" are different businesses.
    const result = classifyCandidates(
      [
        candidate({ displayName: "Panco Cafe - Legazpi Makati", providerPlaceId: "p1" }),
        candidate({ displayName: "Pancho Cafe Makati", providerPlaceId: "p2" })
      ],
      rules
    );

    expect(result.get("p1")?.effectiveClass).toBe("INDEPENDENT_SME");
    expect(result.get("p2")?.effectiveClass).toBe("INDEPENDENT_SME");
  });
});

describe("manual override", () => {
  it("overrides the effective class while preserving the automatic one", () => {
    const result = classifyCandidates([candidate({ displayName: "Jollibee BGC" })], rules);
    const auto = result.get("ChIJ_Jollibee_BGC")!;

    const overridden = applyManualOverride(auto, {
      effectiveClass: "MANUAL_INCLUDE",
      reason: "Independently owned franchisee willing to buy",
      user: "admin"
    });

    expect(overridden.autoClass).toBe("FRANCHISE_EXCLUDED");
    expect(overridden.effectiveClass).toBe("MANUAL_INCLUDE");
    expect(isContactableClass(overridden.effectiveClass)).toBe(true);
    expect(overridden.reasons.at(-1)).toMatchObject({ code: "MANUAL_OVERRIDE" });
    expect(overridden.reasons.at(-1)?.detail).toContain("admin");
    // The original evidence survives the override.
    expect(overridden.reasons[0].detail).toContain("Jollibee");
  });
});

describe("deduplication", () => {
  it("merges an identical place ID automatically", () => {
    const result = dedupeCandidates([
      candidate({ displayName: "Cafe One", providerPlaceId: "same" }),
      candidate({ displayName: "Cafe One", providerPlaceId: "same" })
    ]);

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates[0].signal).toBe("PLACE_ID");
  });

  it("merges on a shared phone number", () => {
    const result = dedupeCandidates([
      candidate({ displayName: "Cafe One", providerPlaceId: "p1", phoneNumber: "0917 156 8299" }),
      candidate({ displayName: "Cafe Uno", providerPlaceId: "p2", phoneNumber: "+639171568299" })
    ]);

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates[0].signal).toBe("PHONE");
  });

  it("merges on an owned domain plus the same brand name", () => {
    const result = dedupeCandidates([
      candidate({ displayName: "Brew Lab", providerPlaceId: "p1", websiteUrl: "https://brewlab.ph" }),
      candidate({ displayName: "Brew Lab", providerPlaceId: "p2", websiteUrl: "https://brewlab.ph" })
    ]);

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates[0].signal).toBe("DOMAIN_AND_NAME");
  });

  it("does NOT merge two businesses that merely share facebook.com", () => {
    const result = dedupeCandidates([
      candidate({ displayName: "Cafe One", providerPlaceId: "p1", websiteUrl: "https://facebook.com/cafeone" }),
      candidate({ displayName: "Cafe Two", providerPlaceId: "p2", websiteUrl: "https://facebook.com/cafetwo" })
    ]);

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
  });

  it("flags a near-identical name at a nearby location for review instead of merging it", () => {
    const result = dedupeCandidates([
      candidate({ displayName: "Kopi Roasters", providerPlaceId: "p1", latitude: 14.55, longitude: 121.02 }),
      candidate({ displayName: "Kopi Roasters", providerPlaceId: "p2", latitude: 14.5505, longitude: 121.0201 })
    ]);

    expect(result.unique).toHaveLength(2);
    expect(result.duplicates).toHaveLength(0);
    expect(result.needsReview).toHaveLength(1);
    expect(result.needsReview[0].distanceMeters).toBeLessThan(150);
  });

  it("does not flag the same brand far apart: those are real branches", () => {
    const result = dedupeCandidates([
      candidate({ displayName: "Kopi Roasters Makati", providerPlaceId: "p1", latitude: 14.55, longitude: 121.02 }),
      candidate({ displayName: "Kopi Roasters BGC", providerPlaceId: "p2", latitude: 14.62, longitude: 121.05 })
    ]);

    expect(result.unique).toHaveLength(2);
    expect(result.needsReview).toHaveLength(0);
  });

  it("computes a sane distance", () => {
    const left = candidate({ displayName: "A", latitude: 14.55, longitude: 121.02 });
    const right = candidate({ displayName: "B", latitude: 14.56, longitude: 121.02 });
    expect(distanceMeters(left, right)).toBeGreaterThan(1000);
    expect(distanceMeters(left, right)).toBeLessThan(1200);
  });

  it("returns null distance when coordinates are missing", () => {
    expect(distanceMeters(candidate({ displayName: "A" }), candidate({ displayName: "B" }))).toBeNull();
  });
});
