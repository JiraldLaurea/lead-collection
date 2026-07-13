import { matchFranchise, type FranchiseBrandRule, type FranchiseMatch } from "@/lib/sme/franchise";
import { splitBusinessName } from "@/lib/sme/normalize-name";
import { brandDomain } from "@/lib/sme/shared-domains";
import type { BusinessCandidate } from "@/lib/sme/types";

export type SmeClass =
  | "INDEPENDENT_SME"
  | "LOCAL_SME_CHAIN"
  | "MANUAL_REVIEW"
  | "LARGE_CHAIN"
  | "FRANCHISE_EXCLUDED"
  | "MANUAL_INCLUDE"
  | "MANUAL_EXCLUDE";

/** Classes that may enter bulk outreach without a human first looking at them. */
const contactableClasses = new Set<SmeClass>(["INDEPENDENT_SME", "LOCAL_SME_CHAIN", "MANUAL_INCLUDE"]);

export function isContactableClass(value: string) {
  return contactableClasses.has(value as SmeClass);
}

export type ClassificationReason = {
  code: string;
  detail: string;
};

export type Classification = {
  autoClass: SmeClass;
  effectiveClass: SmeClass;
  confidence: number;
  reasons: ClassificationReason[];
  /** Locations we have actually observed. A floor, not a true branch count. */
  branchCount: number;
  matchedBrandId: number | null;
  matchedBrandName: string | null;
};

export type ChainThresholds = {
  /** Up to this many observed locations is still a local SME chain. */
  localChainMax: number;
  /** Up to this many goes to manual review; above it, large chain. */
  manualReviewMax: number;
};

export const defaultChainThresholds: ChainThresholds = {
  localChainMax: 5,
  manualReviewMax: 9
};

export type ClassifyOptions = {
  thresholds?: ChainThresholds;
  /**
   * Locations already known from previous searches, keyed by brand candidate name. Without
   * this, branch counts only reflect the current result page and a real chain looks
   * independent simply because we only saw one of its branches.
   */
  priorBranchCounts?: Map<string, number>;
};

/**
 * Collapses brand candidates where one is a complete prefix of another, and returns a map
 * from each brand candidate to its canonical form.
 *
 * Suffix stripping alone relies on a static list of location words, which can never be
 * complete. A live Makati search returned "Nihon Cafe - Concept" (brand "nihon cafe") and
 * "Nihon Cafe Bel Air" (brand "nihon cafe bel air", because "Bel Air" is a barangay not in
 * the list). They are obviously one brand, and suffix stripping missed it.
 *
 * The rule is deliberately strict — one brand must be a *complete token prefix* of the
 * other — so "Cafe de Lipa" and "Cafe de Manila" do NOT merge (neither is a prefix of the
 * other), while "Nihon Cafe" and "Nihon Cafe Bel Air" do. A minimum of two tokens stops a
 * bare "Cafe" from swallowing every cafe in Metro Manila.
 */
export function resolveBrandAliases(brandNames: string[]) {
  const unique = Array.from(new Set(brandNames.filter(Boolean)));
  // Shortest first: a canonical brand is the shortest name others extend.
  const sorted = [...unique].sort((left, right) => left.split(" ").length - right.split(" ").length);
  const canonical = new Map<string, string>();

  for (const name of sorted) {
    const tokens = name.split(" ");
    const base = sorted.find((other) => {
      if (other === name) return false;
      const otherTokens = other.split(" ");
      if (otherTokens.length < 2 || otherTokens.length >= tokens.length) return false;
      return otherTokens.every((token, index) => tokens[index] === token);
    });
    canonical.set(name, base ? canonical.get(base) ?? base : name);
  }

  return canonical;
}

/**
 * Classifies a whole result set together, because chain detection is inherently a property
 * of the set: a business is only a "chain" relative to the other locations we can see.
 */
export function classifyCandidates(
  candidates: BusinessCandidate[],
  rules: FranchiseBrandRule[],
  options: ClassifyOptions = {}
): Map<string, Classification> {
  const thresholds = options.thresholds ?? defaultChainThresholds;
  const priorBranchCounts = options.priorBranchCounts ?? new Map<string, number>();

  // Collapse "Nihon Cafe" and "Nihon Cafe Bel Air" onto one brand before counting.
  const brandAliases = resolveBrandAliases([
    ...candidates.map((candidate) => splitBusinessName(candidate.displayName).brandCandidateName),
    ...priorBranchCounts.keys()
  ]);
  const canonicalBrand = (name: string) => brandAliases.get(name) ?? name;

  // Count observed locations per brand and per owned domain.
  const brandCounts = new Map<string, number>();
  const domainCounts = new Map<string, number>();

  for (const candidate of candidates) {
    const { brandCandidateName } = splitBusinessName(candidate.displayName);
    if (brandCandidateName) {
      const brand = canonicalBrand(brandCandidateName);
      brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
    }
    const host = brandDomain(hostOf(candidate.websiteUrl));
    if (host) {
      domainCounts.set(host, (domainCounts.get(host) ?? 0) + 1);
    }
  }

  // Fold prior counts onto the same canonical brands.
  const canonicalPriorCounts = new Map<string, number>();
  for (const [brand, count] of priorBranchCounts) {
    const canonical = canonicalBrand(brand);
    canonicalPriorCounts.set(canonical, Math.max(canonicalPriorCounts.get(canonical) ?? 0, count));
  }

  const results = new Map<string, Classification>();
  for (const candidate of candidates) {
    results.set(
      candidate.providerPlaceId,
      classifyCandidate(candidate, rules, {
        thresholds,
        brandCounts,
        domainCounts,
        priorBranchCounts: canonicalPriorCounts,
        canonicalBrand
      })
    );
  }
  return results;
}

function classifyCandidate(
  candidate: BusinessCandidate,
  rules: FranchiseBrandRule[],
  context: {
    thresholds: ChainThresholds;
    brandCounts: Map<string, number>;
    domainCounts: Map<string, number>;
    priorBranchCounts: Map<string, number>;
    canonicalBrand: (name: string) => string;
  }
): Classification {
  const reasons: ClassificationReason[] = [];
  const split = splitBusinessName(candidate.displayName);
  const branchLabel = split.branchLabel;
  const brandCandidateName = split.brandCandidateName
    ? context.canonicalBrand(split.brandCandidateName)
    : split.brandCandidateName;
  const host = hostOf(candidate.websiteUrl);
  const ownedDomain = brandDomain(host);

  const match: FranchiseMatch | null = matchFranchise(
    { displayName: candidate.displayName, websiteHost: host },
    rules
  );

  if (match) {
    reasons.push({
      code: `FRANCHISE_${match.matchedOn}_MATCH`,
      detail:
        match.matchedOn === "DOMAIN"
          ? `Website domain "${match.matchedValue}" belongs to ${match.canonicalName}.`
          : `Business name matches the franchise "${match.canonicalName}" (matched "${match.matchedValue}").`
    });

    const autoClass: SmeClass = match.classification === "ALLOWLIST" ? "INDEPENDENT_SME" : "FRANCHISE_EXCLUDED";
    return {
      autoClass,
      effectiveClass: autoClass,
      confidence: match.confidence,
      reasons,
      branchCount: 0,
      matchedBrandId: match.brandId,
      matchedBrandName: match.canonicalName
    };
  }

  // Observed locations: this result set, plus anything already stored from earlier searches.
  const observedInSet = brandCandidateName ? context.brandCounts.get(brandCandidateName) ?? 1 : 1;
  const observedPreviously = brandCandidateName ? context.priorBranchCounts.get(brandCandidateName) ?? 0 : 0;
  const domainObserved = ownedDomain ? context.domainCounts.get(ownedDomain) ?? 0 : 0;
  const branchCount = Math.max(observedInSet, observedPreviously, domainObserved);

  if (branchCount > 1 && brandCandidateName) {
    reasons.push({
      code: "BRAND_NAME_REPEATED",
      detail: `"${brandCandidateName}" appears at ${branchCount} observed location${branchCount === 1 ? "" : "s"}.`
    });
  }
  if (domainObserved > 1 && ownedDomain) {
    reasons.push({
      code: "SHARED_BRAND_DOMAIN",
      detail: `${domainObserved} locations share the domain "${ownedDomain}".`
    });
  }
  if (branchLabel) {
    reasons.push({
      code: "BRANCH_LABEL_DETECTED",
      detail: `Name carries a branch label ("${branchLabel}"), which suggests more than one location.`
    });
  }
  if (host && !ownedDomain) {
    reasons.push({
      code: "NO_OWNED_DOMAIN",
      detail: `Listed website "${host}" is a shared platform page, so it is not evidence of a brand domain.`
    });
  }

  const { thresholds } = context;
  let autoClass: SmeClass;
  let confidence: number;

  if (branchCount >= thresholds.manualReviewMax + 1) {
    autoClass = "LARGE_CHAIN";
    confidence = 70;
  } else if (branchCount >= thresholds.localChainMax + 1) {
    autoClass = "MANUAL_REVIEW";
    confidence = 50;
  } else if (branchCount >= 2) {
    autoClass = "LOCAL_SME_CHAIN";
    confidence = 75;
    reasons.push({
      code: "LOCAL_CHAIN_RETAINED",
      detail: "A locally controlled business with a few branches is a high-value prospect, not a franchise."
    });
  } else {
    autoClass = "INDEPENDENT_SME";
    // Deliberately not high: we only ever see the branches a search returned, so "one
    // location" means "one we have seen", not "one that exists".
    confidence = branchLabel ? 45 : 65;
    reasons.push({
      code: "SINGLE_OBSERVED_LOCATION",
      detail: "Only one location has been observed. Branch counts reflect what searches have returned so far."
    });
  }

  return {
    autoClass,
    effectiveClass: autoClass,
    confidence,
    reasons,
    branchCount,
    matchedBrandId: null,
    matchedBrandName: null
  };
}

/** Applies a human decision over the automatic one. The auto class is never overwritten. */
export function applyManualOverride(
  classification: Classification,
  override: { effectiveClass: SmeClass; reason: string; user: string }
): Classification {
  return {
    ...classification,
    effectiveClass: override.effectiveClass,
    confidence: 100,
    reasons: [
      ...classification.reasons,
      {
        code: "MANUAL_OVERRIDE",
        detail: `${override.user} set this to ${override.effectiveClass}: ${override.reason}`
      }
    ]
  };
}

function hostOf(url?: string | null) {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
