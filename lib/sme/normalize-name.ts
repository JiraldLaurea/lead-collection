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
