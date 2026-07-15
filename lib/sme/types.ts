export type SearchMode = "COMMERCIAL_ROAD" | "CITY_CATEGORY" | "MAP_RADIUS" | "FREE_TEXT";

export type BusinessStatus = "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

export type SearchRequest = {
  mode: SearchMode;
  city?: string;
  commercialArea?: string;
  roadName?: string;
  /** Internal category key from lib/sme/categories.ts, not a raw Google place type. */
  category?: string;
  keyword?: string;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  maxResults?: number;
  /** Priority (A+/A/B+/B/C) of the commercial zone, when the search came from one. */
  zonePriority?: string;
};

export type SearchFilters = {
  minRating?: number;
  minReviewCount?: number;
  maxReviewCount?: number;
  hasPhone?: boolean;
  hasWebsite?: boolean;
  businessStatus?: BusinessStatus;
  classification?: string;
  franchiseStatus?: "INCLUDED" | "EXCLUDED";
  leadStatus?: "CAPTURED" | "SAVED" | "CONTACTED" | "DO_NOT_CONTACT";
  excludeDoNotContact?: boolean;
  excludePreviouslyContacted?: boolean;
};

/**
 * A business as the application sees it. Deliberately not Google's response shape:
 * everything downstream (classification, scoring, UI) depends on this type only, so a
 * provider change stays inside lib/sme/google-places.ts.
 *
 * Contact fields are null until the details stage runs — `detailsFetched` says which.
 */
export type BusinessCandidate = {
  providerPlaceId: string;
  displayName: string;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryType: string | null;
  types: string[];
  businessStatus: BusinessStatus | null;
  googleMapsUri: string | null;
  phoneNumber: string | null;
  websiteUrl: string | null;
  rating: number | null;
  userRatingCount: number | null;
  detailsFetched: boolean;
  fetchedAt: Date;
};

export type DiscoveryPage = {
  candidates: BusinessCandidate[];
  nextPageToken: string | null;
};

export type SearchRunSummary = {
  total: number;
  qualified: number;
  manualReview: number;
  excluded: number;
  alreadySaved: number;
  errors: number;
};
