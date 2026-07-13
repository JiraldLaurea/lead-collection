/**
 * Base business-name normalization (work order 6.3, steps 1-4).
 *
 * Branch/location suffix stripping and the brand/branch split live in the Phase 3
 * classifier, which builds on this function. The original name is never mutated in
 * place — callers keep it alongside the normalized form.
 */
export function normalizeBusinessName(value: string) {
  return (
    value
      .normalize("NFKD")
      // Strip combining accents so "Café" and "Cafe" normalize alike.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['’`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

/**
 * Tokens that mark what follows (or precedes) as a branch label rather than part of the
 * brand. Removed only as whole tokens: "outlet" is a branch marker, but "Outlet Shoes"
 * would lose its identity if we stripped substrings.
 */
const branchMarkerTokens = new Set(["branch", "store", "outlet", "stall", "kiosk", "shop"]);

/**
 * Location words that commonly appear as a branch suffix in Metro Manila. Only stripped
 * when they trail the name, never when they are the whole name — "Makati Supermarket" is
 * a brand, "ABC Cafe Makati" is a branch of ABC Cafe.
 */
const locationSuffixTokens = [
  "bgc",
  "makati",
  "poblacion",
  "ortigas",
  "kapitolyo",
  "greenhills",
  "alabang",
  "molito",
  "timog",
  "morato",
  "cubao",
  "katipunan",
  "eastwood",
  "rockwell",
  "megamall",
  "sm",
  "smnorth",
  "smmegamall",
  "trinoma",
  "gateway",
  "glorietta",
  "greenbelt",
  "high",
  "street",
  "quezon",
  "city",
  "pasig",
  "taguig",
  "paranaque",
  "muntinlupa",
  "mandaluyong",
  "san",
  "juan",
  "bf",
  "homes",
  "aguirre",
  "manila",
  "pasay",
  "marikina",
  "caloocan",
  "las",
  "pinas",
  "valenzuela",
  "malabon",
  "navotas",
  "pateros",
  "wilson",
  "tomas",
  "avenue",
  "ave"
];

export type SplitBusinessName = {
  /** Full normalized name, branch label included. */
  normalizedName: string;
  /** Best guess at the brand, with branch/location suffixes removed. */
  brandCandidateName: string;
  /** The branch part that was removed, or null. */
  branchLabel: string | null;
};

/**
 * Splits a business name into a brand candidate and a branch label (work order 6.3).
 *
 * "ABC Cafe - BGC High Street Branch" -> brand "abc cafe", branch "bgc high street"
 *
 * The brand candidate is only used as *evidence* for chain detection, never as truth: a
 * false split would merge unrelated businesses, so we refuse to strip a suffix when doing
 * so would leave nothing behind.
 */
export function splitBusinessName(value: string): SplitBusinessName {
  const normalizedName = normalizeBusinessName(value);
  if (!normalizedName) {
    return { normalizedName, brandCandidateName: normalizedName, branchLabel: null };
  }

  // Prefer an explicit separator: everything after " - " or " @ " is usually the branch.
  const separatorMatch = value.match(/^(.*?)\s*[-–—@|]\s*(.+)$/);
  if (separatorMatch) {
    const brand = normalizeBusinessName(separatorMatch[1]);
    const branch = stripBranchMarkers(normalizeBusinessName(separatorMatch[2]));
    if (brand && branch) {
      return { normalizedName, brandCandidateName: brand, branchLabel: branch };
    }
  }

  // Otherwise peel trailing branch markers and location words off the end.
  const tokens = normalizedName.split(" ");
  const branchTokens: string[] = [];

  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (!branchMarkerTokens.has(last) && !locationSuffixTokens.includes(last)) break;
    branchTokens.unshift(tokens.pop() as string);
  }

  const brandCandidateName = tokens.join(" ");
  const branchLabel = stripBranchMarkers(branchTokens.join(" "));

  // Never let stripping consume the whole name.
  if (!brandCandidateName) {
    return { normalizedName, brandCandidateName: normalizedName, branchLabel: null };
  }

  return { normalizedName, brandCandidateName, branchLabel: branchLabel || null };
}

function stripBranchMarkers(value: string) {
  return value
    .split(" ")
    .filter((token) => token && !branchMarkerTokens.has(token))
    .join(" ");
}

/**
 * Reduces a URL to a comparable host: lowercase, no scheme, no "www.", no path.
 * Returns null for anything that is not a parseable http(s) URL.
 */
export function normalizeWebsiteHost(value?: string | null) {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.hostname.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}
