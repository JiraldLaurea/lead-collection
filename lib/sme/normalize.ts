import type { BusinessCandidate, BusinessStatus } from "@/lib/sme/types";

/** Shape of a place in a Places API (New) response, as far as our field masks request it. */
export type GooglePlace = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  businessStatus?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
};

const businessStatuses: BusinessStatus[] = ["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"];

function toBusinessStatus(value?: string): BusinessStatus | null {
  if (!value) return null;
  return businessStatuses.includes(value as BusinessStatus) ? (value as BusinessStatus) : null;
}

/**
 * Maps one Google place to a BusinessCandidate. Returns null when the place has no id or
 * no display name — a record we cannot identify is not worth carrying downstream.
 *
 * `detailsFetched` records whether contact fields were requested at all, so a null phone
 * from the discovery stage is never mistaken for a business that has no phone.
 */
export function toBusinessCandidate(
  place: GooglePlace,
  options: { detailsFetched: boolean; fetchedAt?: Date }
): BusinessCandidate | null {
  const providerPlaceId = place.id?.trim();
  const displayName = place.displayName?.text?.trim();
  if (!providerPlaceId || !displayName) return null;

  return {
    providerPlaceId,
    displayName,
    formattedAddress: place.formattedAddress?.trim() || null,
    latitude: typeof place.location?.latitude === "number" ? place.location.latitude : null,
    longitude: typeof place.location?.longitude === "number" ? place.location.longitude : null,
    primaryType: place.primaryType?.trim() || null,
    types: Array.isArray(place.types) ? place.types.filter((type) => typeof type === "string") : [],
    businessStatus: toBusinessStatus(place.businessStatus),
    googleMapsUri: place.googleMapsUri?.trim() || null,
    phoneNumber: place.nationalPhoneNumber?.trim() || place.internationalPhoneNumber?.trim() || null,
    websiteUrl: place.websiteUri?.trim() || null,
    rating: typeof place.rating === "number" ? place.rating : null,
    userRatingCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    detailsFetched: options.detailsFetched,
    fetchedAt: options.fetchedAt ?? new Date()
  };
}

export function toBusinessCandidates(
  places: GooglePlace[] | undefined,
  options: { detailsFetched: boolean; fetchedAt?: Date }
): BusinessCandidate[] {
  if (!Array.isArray(places)) return [];
  return places
    .map((place) => toBusinessCandidate(place, options))
    .filter((candidate): candidate is BusinessCandidate => candidate !== null);
}
