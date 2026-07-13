import { toBusinessCandidate, toBusinessCandidates, type GooglePlace } from "@/lib/sme/normalize";
import type { BusinessCandidate, DiscoveryPage } from "@/lib/sme/types";

const PLACES_BASE_URL = "https://places.googleapis.com/v1";

/**
 * Field masks are centralized here and never use "*". Google bills each request at the
 * highest SKU tier touched by the requested fields, so discovery deliberately omits
 * phone, website, rating and review count — those cost more and are only fetched at the
 * details stage, for candidates that already survived franchise screening.
 */
export const DISCOVERY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.businessStatus",
  "places.googleMapsUri"
].join(",");

/** Text Search paginates; Nearby Search does not, so it must not request nextPageToken. */
export const TEXT_SEARCH_FIELD_MASK = `${DISCOVERY_FIELD_MASK},nextPageToken`;

export const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "primaryType",
  "types",
  "businessStatus",
  "googleMapsUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "rating",
  "userRatingCount"
].join(",");

export const MAX_PAGE_SIZE = 20;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 300;

export type PlacesErrorCode =
  | "E-PLACES-01" // API key not configured
  | "E-PLACES-02" // request failed / unexpected
  | "E-PLACES-03" // quota exceeded or rate limited
  | "E-PLACES-04" // permission denied (key restriction, API not enabled, billing)
  | "E-PLACES-05" // invalid request
  | "E-PLACES-06"; // timeout or aborted

export class PlacesError extends Error {
  readonly code: PlacesErrorCode;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(code: PlacesErrorCode, message: string, options: { status?: number; retryable?: boolean } = {}) {
    super(message);
    this.name = "PlacesError";
    this.code = code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === "replace_with_google_maps_api_key") {
    throw new PlacesError("E-PLACES-01", "GOOGLE_MAPS_API_KEY is not configured");
  }
  return key;
}

/** Google echoes the request back in some errors; strip anything key-shaped before logging. */
export function redactSecrets(value: string) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  let output = value;
  if (key && key.length > 8) output = output.split(key).join("[redacted]");
  return output.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[redacted]");
}

function errorForStatus(status: number, message: string) {
  if (status === 429) return new PlacesError("E-PLACES-03", message, { status, retryable: true });
  if (status === 401 || status === 403) return new PlacesError("E-PLACES-04", message, { status });
  if (status === 400 || status === 404) return new PlacesError("E-PLACES-05", message, { status });
  if (status >= 500) return new PlacesError("E-PLACES-02", message, { status, retryable: true });
  return new PlacesError("E-PLACES-02", message, { status });
}

function backoffDelayMs(attempt: number) {
  const exponential = BASE_BACKOFF_MS * 2 ** (attempt - 1);
  return exponential + Math.random() * BASE_BACKOFF_MS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type CallOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

async function callPlaces<T>(
  path: string,
  fieldMask: string,
  init: { method: "GET" | "POST"; body?: unknown },
  options: CallOptions = {}
): Promise<T> {
  const key = apiKey();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastError: PlacesError | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // A caller abort (user left the page, new search started) must not be retried.
    if (options.signal?.aborted) {
      throw new PlacesError("E-PLACES-06", "Places request aborted");
    }

    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    let response: Response;
    try {
      response = await fetch(`${PLACES_BASE_URL}${path}`, {
        method: init.method,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": fieldMask
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal
      });
    } catch (error) {
      // Caller-initiated abort is final; a timeout or network blip is worth retrying.
      if (options.signal?.aborted) {
        throw new PlacesError("E-PLACES-06", "Places request aborted");
      }
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      lastError = timedOut
        ? new PlacesError("E-PLACES-06", `Places request timed out after ${timeoutMs}ms`, { retryable: true })
        : new PlacesError("E-PLACES-02", "Places request failed", { retryable: true });

      if (attempt === MAX_ATTEMPTS) throw lastError;
      await sleep(backoffDelayMs(attempt));
      continue;
    }

    if (response.ok) {
      return (await response.json()) as T;
    }

    const rawBody = await response.text().catch(() => "");
    const message = redactSecrets(parseGoogleErrorMessage(rawBody) || `Places request failed (${response.status})`);
    const error = errorForStatus(response.status, message);

    // 400/401/403/404 are configuration errors: retrying just burns quota and time.
    if (!error.retryable || attempt === MAX_ATTEMPTS) throw error;
    lastError = error;
    await sleep(backoffDelayMs(attempt));
  }

  throw lastError ?? new PlacesError("E-PLACES-02", "Places request failed");
}

function parseGoogleErrorMessage(rawBody: string) {
  if (!rawBody) return "";
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string; status?: string } };
    return parsed.error?.message || parsed.error?.status || "";
  } catch {
    return rawBody.slice(0, 200);
  }
}

export type TextSearchParams = {
  textQuery: string;
  pageSize?: number;
  pageToken?: string;
  /** Biases results toward a circle without hard-excluding anything outside it. */
  locationBias?: { latitude: number; longitude: number; radiusMeters: number };
};

export async function searchText(params: TextSearchParams, options: CallOptions = {}): Promise<DiscoveryPage> {
  const body: Record<string, unknown> = {
    textQuery: params.textQuery,
    pageSize: clampPageSize(params.pageSize),
    languageCode: "en",
    regionCode: "PH"
  };
  // Google requires every other parameter to stay identical when continuing a page.
  if (params.pageToken) body.pageToken = params.pageToken;
  if (params.locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: params.locationBias.latitude, longitude: params.locationBias.longitude },
        radius: params.locationBias.radiusMeters
      }
    };
  }

  const json = await callPlaces<{ places?: GooglePlace[]; nextPageToken?: string }>(
    "/places:searchText",
    TEXT_SEARCH_FIELD_MASK,
    { method: "POST", body },
    options
  );

  return {
    candidates: toBusinessCandidates(json.places, { detailsFetched: false }),
    nextPageToken: json.nextPageToken ?? null
  };
}

export type NearbySearchParams = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  includedTypes: string[];
  maxResultCount?: number;
  rankPreference?: "POPULARITY" | "DISTANCE";
};

export async function searchNearby(params: NearbySearchParams, options: CallOptions = {}): Promise<DiscoveryPage> {
  const body = {
    includedTypes: params.includedTypes,
    maxResultCount: clampPageSize(params.maxResultCount),
    rankPreference: params.rankPreference ?? "DISTANCE",
    locationRestriction: {
      circle: {
        center: { latitude: params.latitude, longitude: params.longitude },
        radius: params.radiusMeters
      }
    },
    languageCode: "en",
    regionCode: "PH"
  };

  const json = await callPlaces<{ places?: GooglePlace[] }>(
    "/places:searchNearby",
    DISCOVERY_FIELD_MASK,
    { method: "POST", body },
    options
  );

  // Nearby Search (New) has no pagination; coverage comes from overlapping search points.
  return {
    candidates: toBusinessCandidates(json.places, { detailsFetched: false }),
    nextPageToken: null
  };
}

/** Contact stage. Only call this for candidates that passed franchise screening. */
export async function placeDetails(providerPlaceId: string, options: CallOptions = {}): Promise<BusinessCandidate> {
  const id = providerPlaceId.replace(/^places\//, "");
  const json = await callPlaces<GooglePlace>(
    `/places/${encodeURIComponent(id)}`,
    DETAILS_FIELD_MASK,
    { method: "GET" },
    options
  );

  const candidate = toBusinessCandidate(json, { detailsFetched: true });
  if (!candidate) {
    throw new PlacesError("E-PLACES-02", "Place details response was missing an id or name");
  }
  return candidate;
}

function clampPageSize(value?: number) {
  if (!value || !Number.isFinite(value)) return MAX_PAGE_SIZE;
  return Math.min(Math.max(Math.floor(value), 1), MAX_PAGE_SIZE);
}
