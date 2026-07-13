import { normalizeBusinessName, splitBusinessName } from "@/lib/sme/normalize-name";
import { brandDomain } from "@/lib/sme/shared-domains";

/** The subset of a FranchiseBrand row the matcher needs. Keeps this module free of Prisma. */
export type FranchiseBrandRule = {
  id: number;
  canonicalName: string;
  normalizedName: string;
  /** Semicolon-separated normalized aliases, including the canonical name. */
  normalizedAliases: string;
  /** Semicolon-separated bare hosts. */
  officialDomains: string;
  classification: string;
  active: boolean;
};

export type FranchiseMatch = {
  brandId: number;
  canonicalName: string;
  classification: string;
  /** How the match was made — shown to the user so an exclusion is never unexplained. */
  matchedOn: "DOMAIN" | "EXACT_NAME" | "BRAND_CANDIDATE" | "NAME_PREFIX";
  matchedValue: string;
  confidence: number;
};

/**
 * True when every token of `brand` opens `name`, in order.
 *
 * Branch-suffix stripping cannot save us here: it relies on a finite list of location words,
 * and Metro Manila branch names are unbounded. A live search returned "Starbucks San Antonio
 * Paranaque", which strips only to "starbucks san antonio" because "Antonio" is in no list —
 * so the name never matched, and Starbucks was caught only by its domain, after we had
 * already paid for its contact details. "Jollibee SM Sucat" would have escaped entirely.
 *
 * Matching on whole tokens (not substrings) is what makes this safe: "Benchmark Fitness"
 * does not start with the token "bench", and "Old McDonald's Farm Supply" does not *start*
 * with "mcdonalds".
 */
function isTokenPrefix(brand: string, name: string) {
  const brandTokens = brand.split(" ").filter(Boolean);
  const nameTokens = name.split(" ").filter(Boolean);
  if (brandTokens.length === 0 || brandTokens.length >= nameTokens.length) return false;
  return brandTokens.every((token, index) => nameTokens[index] === token);
}

function splitList(value: string) {
  return value
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Matches a business against the franchise blacklist.
 *
 * Ordered by how much we trust the signal: an owned corporate domain is near-certain, an
 * exact name match is strong, and a match only after branch-suffix stripping is good but
 * fallible ("ABC Cafe Makati" -> "abc cafe"), so it scores lower and stays reversible.
 *
 * Substring matching is deliberately NOT used. "Bo's Coffee" must not swallow
 * "Bobby's Coffee House", and "Bench" must not swallow "Benchmark Fitness".
 */
export function matchFranchise(
  business: { displayName: string; websiteHost?: string | null },
  rules: FranchiseBrandRule[]
): FranchiseMatch | null {
  const activeRules = rules.filter((rule) => rule.active);
  if (activeRules.length === 0) return null;

  // A shared host (facebook.com) is not a brand domain and must never match.
  const host = brandDomain(business.websiteHost);
  if (host) {
    for (const rule of activeRules) {
      const domains = splitList(rule.officialDomains);
      const hit = domains.find((domain) => host === domain || host.endsWith(`.${domain}`));
      if (hit) {
        return {
          brandId: rule.id,
          canonicalName: rule.canonicalName,
          classification: rule.classification,
          matchedOn: "DOMAIN",
          matchedValue: hit,
          confidence: 98
        };
      }
    }
  }

  const { normalizedName, brandCandidateName } = splitBusinessName(business.displayName);

  for (const rule of activeRules) {
    const aliases = splitList(rule.normalizedAliases);
    if (aliases.includes(normalizedName)) {
      return {
        brandId: rule.id,
        canonicalName: rule.canonicalName,
        classification: rule.classification,
        matchedOn: "EXACT_NAME",
        matchedValue: normalizedName,
        confidence: 95
      };
    }
  }

  for (const rule of activeRules) {
    const aliases = splitList(rule.normalizedAliases);
    if (brandCandidateName && brandCandidateName !== normalizedName && aliases.includes(brandCandidateName)) {
      return {
        brandId: rule.id,
        canonicalName: rule.canonicalName,
        classification: rule.classification,
        matchedOn: "BRAND_CANDIDATE",
        matchedValue: brandCandidateName,
        confidence: 80
      };
    }
  }

  // Last resort: the brand opens the name, and whatever follows is an unrecognized branch
  // label. Scored below the other signals because it is the most fallible.
  for (const rule of activeRules) {
    const aliases = splitList(rule.normalizedAliases);
    const hit = aliases.find((alias) => isTokenPrefix(alias, normalizedName));
    if (hit) {
      return {
        brandId: rule.id,
        canonicalName: rule.canonicalName,
        classification: rule.classification,
        matchedOn: "NAME_PREFIX",
        matchedValue: hit,
        confidence: 85
      };
    }
  }

  return null;
}

/** Prepares an imported brand row for matching. Exported for tests and admin previews. */
export function toFranchiseRule(input: {
  id: number;
  canonicalName: string;
  aliases?: string;
  officialDomains?: string;
  classification?: string;
  active?: boolean;
}): FranchiseBrandRule {
  const normalizedName = normalizeBusinessName(input.canonicalName);
  const aliases = (input.aliases ?? "")
    .split(";")
    .map((alias) => normalizeBusinessName(alias))
    .filter(Boolean);

  return {
    id: input.id,
    canonicalName: input.canonicalName,
    normalizedName,
    normalizedAliases: Array.from(new Set([normalizedName, ...aliases])).join(";"),
    officialDomains: input.officialDomains ?? "",
    classification: input.classification ?? "KNOWN_FRANCHISE",
    active: input.active ?? true
  };
}
