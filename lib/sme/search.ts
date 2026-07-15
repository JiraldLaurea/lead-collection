import { findSmeCategory, smeCategories } from "@/lib/sme/categories";
import { MAX_PAGE_SIZE, PlacesError, searchNearby, searchText } from "@/lib/sme/google-places";
import type { BusinessCandidate, SearchRequest } from "@/lib/sme/types";

const DEFAULT_MAX_RESULTS = 60;
const HARD_MAX_RESULTS = 200;
const DEFAULT_RADIUS_M = 500;
const broadSmePlaceTypes = Array.from(new Set(smeCategories.flatMap((item) => item.googleTypes)));

export type DiscoveryOptions = {
  signal?: AbortSignal;
};

/**
 * Builds the Text Search query for a request. Google's text queries work best as a plain
 * natural-language phrase, so we join only the parts the caller actually supplied.
 */
export function buildTextQuery(request: SearchRequest) {
  const category = findSmeCategory(request.category);
  const subject = [request.keyword?.trim(), category?.textQuery].filter(Boolean).join(" ").trim();
  const place = [request.roadName?.trim(), request.commercialArea?.trim(), request.city?.trim()]
    .filter(Boolean)
    .join(", ");

  if (!subject) return place;
  if (!place) return subject;
  return `${subject} in ${place}`;
}

function requireCoordinates(request: SearchRequest) {
  if (typeof request.latitude !== "number" || typeof request.longitude !== "number") {
    throw new PlacesError("E-PLACES-05", "This search mode requires a latitude and longitude");
  }
  return { latitude: request.latitude, longitude: request.longitude };
}

/**
 * Runs one discovery search and returns candidates deduplicated by Google place ID.
 *
 * Only the discovery field mask is used here — no phone, website or rating. Those are
 * fetched later, per candidate, and only for candidates worth paying for.
 */
export async function runDiscovery(
  request: SearchRequest,
  options: DiscoveryOptions = {}
): Promise<BusinessCandidate[]> {
  const maxResults = Math.min(request.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS);
  if (maxResults < 1) return [];

  const category = findSmeCategory(request.category);
  const radiusMeters = request.radiusMeters ?? DEFAULT_RADIUS_M;

  // Nearby Search needs a coordinate and at least one Google place type. Categories with no
  // Google equivalent (skin clinic, tutorial center, ...) fall back to a location-biased
  // Text Search rather than silently returning nothing.
  const wantsNearby =
    request.mode === "MAP_RADIUS" ||
    (request.mode === "COMMERCIAL_ROAD" && typeof request.latitude === "number");

  const nearbyTypes = category ? category.googleTypes : broadSmePlaceTypes;

  // A radius-only search has no sensible default category. Validate before building
  // the Nearby request so an invalid form never spends a Google Places call.
  if (request.mode === "MAP_RADIUS" && !category) {
    throw new PlacesError("E-PLACES-05", "Map radius search requires a business category");
  }

  if (wantsNearby && nearbyTypes.length > 0) {
    const { latitude, longitude } = requireCoordinates(request);
    const page = await searchNearby(
      {
        latitude,
        longitude,
        radiusMeters,
        // "Any" uses all supported SME types, rather than a vague text query such as
        // "business in <street>" that can return only the street/place record.
        includedTypes: nearbyTypes,
        maxResultCount: Math.min(maxResults, MAX_PAGE_SIZE)
      },
      options
    );
    return dedupeByPlaceId(page.candidates).slice(0, maxResults);
  }

  const textQuery = buildTextQuery(request);
  if (!textQuery) {
    throw new PlacesError("E-PLACES-05", "Search requires a keyword, a category, or a location");
  }

  const locationBias =
    typeof request.latitude === "number" && typeof request.longitude === "number"
      ? { latitude: request.latitude, longitude: request.longitude, radiusMeters }
      : undefined;

  const collected: BusinessCandidate[] = [];
  let pageToken: string | undefined;

  do {
    const page = await searchText(
      { textQuery, pageSize: MAX_PAGE_SIZE, pageToken, locationBias },
      options
    );
    collected.push(...page.candidates);
    pageToken = page.nextPageToken ?? undefined;
  } while (pageToken && collected.length < maxResults);

  return dedupeByPlaceId(collected).slice(0, maxResults);
}

/**
 * Google can return the same place across pages and across overlapping search points.
 * Place ID is the authoritative identity, so first occurrence wins.
 */
export function dedupeByPlaceId(candidates: BusinessCandidate[]) {
  const seen = new Set<string>();
  const unique: BusinessCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.providerPlaceId)) continue;
    seen.add(candidate.providerPlaceId);
    unique.push(candidate);
  }
  return unique;
}
