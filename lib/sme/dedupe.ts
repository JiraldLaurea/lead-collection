import { normalizePhilippineMobileNumber } from "@/lib/export";
import { splitBusinessName } from "@/lib/sme/normalize-name";
import { brandDomain } from "@/lib/sme/shared-domains";
import type { BusinessCandidate } from "@/lib/sme/types";

export type DuplicateSignal = "PLACE_ID" | "PHONE" | "DOMAIN_AND_NAME";

export type DuplicateMatch = {
  candidate: BusinessCandidate;
  duplicateOf: BusinessCandidate;
  signal: DuplicateSignal;
};

/** A pair that looks similar but is not safe to merge automatically. */
export type ReviewMatch = {
  candidate: BusinessCandidate;
  similarTo: BusinessCandidate;
  reason: string;
  distanceMeters: number | null;
};

export type DedupeResult = {
  unique: BusinessCandidate[];
  duplicates: DuplicateMatch[];
  needsReview: ReviewMatch[];
};

/** Two businesses this close with near-identical names are worth a human look. */
const reviewProximityMeters = 150;

/**
 * Deduplicates a result set (work order 7.7 / 6.4).
 *
 * Signals are applied in descending order of trust:
 *   1. Google place ID  — authoritative identity, merged automatically.
 *   2. Normalized phone — a business rarely shares a line with another business.
 *   3. Owned domain + same brand name — same brand, same site.
 *
 * A near-identical name at a nearby location is deliberately NOT auto-merged: two genuinely
 * different tenants ("Kopi Roasters" on the ground floor and in the food court) would be
 * silently collapsed, and merging is far harder to undo than reviewing. Those go to review.
 */
export function dedupeCandidates(candidates: BusinessCandidate[]): DedupeResult {
  const unique: BusinessCandidate[] = [];
  const duplicates: DuplicateMatch[] = [];
  const needsReview: ReviewMatch[] = [];

  const byPlaceId = new Map<string, BusinessCandidate>();
  const byPhone = new Map<string, BusinessCandidate>();
  const byDomainAndName = new Map<string, BusinessCandidate>();

  for (const candidate of candidates) {
    const placeIdHit = byPlaceId.get(candidate.providerPlaceId);
    if (placeIdHit) {
      duplicates.push({ candidate, duplicateOf: placeIdHit, signal: "PLACE_ID" });
      continue;
    }

    const phone = normalizePhilippineMobileNumber(candidate.phoneNumber);
    const phoneHit = phone ? byPhone.get(phone) : undefined;
    if (phoneHit) {
      duplicates.push({ candidate, duplicateOf: phoneHit, signal: "PHONE" });
      continue;
    }

    const { brandCandidateName } = splitBusinessName(candidate.displayName);
    const domain = brandDomain(hostOf(candidate.websiteUrl));
    const domainKey = domain && brandCandidateName ? `${domain}|${brandCandidateName}` : null;
    const domainHit = domainKey ? byDomainAndName.get(domainKey) : undefined;
    if (domainHit) {
      duplicates.push({ candidate, duplicateOf: domainHit, signal: "DOMAIN_AND_NAME" });
      continue;
    }

    // Not a duplicate — but is it close enough to something we kept to warrant a look?
    const similar = unique.find((existing) => {
      const existingBrand = splitBusinessName(existing.displayName).brandCandidateName;
      if (!brandCandidateName || existingBrand !== brandCandidateName) return false;
      const distance = distanceMeters(candidate, existing);
      return distance !== null && distance <= reviewProximityMeters;
    });

    if (similar) {
      needsReview.push({
        candidate,
        similarTo: similar,
        reason: "Same brand name within 150 m, but different place IDs. Could be two tenants or one business listed twice.",
        distanceMeters: distanceMeters(candidate, similar)
      });
    }

    unique.push(candidate);
    byPlaceId.set(candidate.providerPlaceId, candidate);
    if (phone) byPhone.set(phone, candidate);
    if (domainKey) byDomainAndName.set(domainKey, candidate);
  }

  return { unique, duplicates, needsReview };
}

/** Great-circle distance in metres, or null when either side has no coordinates. */
export function distanceMeters(left: BusinessCandidate, right: BusinessCandidate) {
  if (
    left.latitude === null ||
    left.longitude === null ||
    right.latitude === null ||
    right.longitude === null
  ) {
    return null;
  }

  const earthRadius = 6371000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLng = toRadians(right.longitude - left.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(left.latitude)) * Math.cos(toRadians(right.latitude)) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function hostOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
