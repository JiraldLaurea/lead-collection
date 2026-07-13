import { prisma } from "@/lib/prisma";
import type { FranchiseBrandRule } from "@/lib/sme/franchise";
import { splitBusinessName } from "@/lib/sme/normalize-name";
import type { BusinessCandidate } from "@/lib/sme/types";

/** Loads the active blacklist. The rules live in the database, never in code (work order 6.2). */
export async function loadFranchiseRules(): Promise<FranchiseBrandRule[]> {
  const brands = await prisma.franchiseBrand.findMany({ where: { active: true } });
  return brands.map((brand) => ({
    id: brand.id,
    canonicalName: brand.canonicalName,
    normalizedName: brand.normalizedName,
    normalizedAliases: brand.normalizedAliases,
    officialDomains: brand.officialDomains,
    classification: brand.classification,
    active: brand.active
  }));
}

/**
 * Counts locations we have already stored for the brands in this result set.
 *
 * Without this, branch counting only sees the current page of results, and a genuine
 * 8-branch chain looks like an independent SME simply because one search happened to
 * return one of its branches.
 */
export async function loadPriorBranchCounts(candidates: BusinessCandidate[]) {
  const brandNames = Array.from(
    new Set(
      candidates
        .map((candidate) => splitBusinessName(candidate.displayName).brandCandidateName)
        .filter(Boolean)
    )
  );
  if (brandNames.length === 0) return new Map<string, number>();

  const stored = await prisma.smeBusinessProfile.findMany({
    where: { brandCandidateName: { in: brandNames } },
    select: { brandCandidateName: true, providerPlaceId: true }
  });

  const counts = new Map<string, number>();
  const seenPlaceIds = new Map<string, Set<string>>();

  for (const profile of stored) {
    const brand = profile.brandCandidateName;
    if (!brand) continue;
    const places = seenPlaceIds.get(brand) ?? new Set<string>();
    places.add(profile.providerPlaceId);
    seenPlaceIds.set(brand, places);
    counts.set(brand, places.size);
  }

  return counts;
}
