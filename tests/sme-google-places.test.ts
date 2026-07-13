import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DETAILS_FIELD_MASK,
  DISCOVERY_FIELD_MASK,
  PlacesError,
  placeDetails,
  redactSecrets,
  searchNearby,
  searchText
} from "@/lib/sme/google-places";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
  const headers = init.headers as Record<string, string>;
  return {
    url,
    headers,
    body: init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
  };
}

const samplePlace = {
  id: "ChIJ_sample_1",
  displayName: { text: "Aguirre Garden Cafe" },
  formattedAddress: "Aguirre Ave, BF Homes, Paranaque",
  location: { latitude: 14.47, longitude: 121.02 },
  primaryType: "cafe",
  types: ["cafe", "food"],
  businessStatus: "OPERATIONAL",
  googleMapsUri: "https://maps.google.com/?cid=1"
};

describe("Google Places (New) adapter", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.GOOGLE_MAPS_API_KEY = "AIzaTESTKEY1234567890";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("fails fast when the API key is not configured", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    await expect(searchText({ textQuery: "cafe" })).rejects.toMatchObject({ code: "E-PLACES-01" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the key and an explicit field mask, never a wildcard", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [samplePlace] }));
    await searchText({ textQuery: "cafe in Makati" });

    const { headers } = lastRequest();
    expect(headers["X-Goog-Api-Key"]).toBe("AIzaTESTKEY1234567890");
    expect(headers["X-Goog-FieldMask"]).toBe(`${DISCOVERY_FIELD_MASK},nextPageToken`);
    expect(headers["X-Goog-FieldMask"]).not.toContain("*");
  });

  it("keeps high-cost contact fields out of the discovery mask", () => {
    for (const field of ["nationalPhoneNumber", "websiteUri", "rating", "userRatingCount", "reviews", "photos"]) {
      expect(DISCOVERY_FIELD_MASK).not.toContain(field);
    }
    // Contact fields belong to the details stage only.
    expect(DETAILS_FIELD_MASK).toContain("nationalPhoneNumber");
    expect(DETAILS_FIELD_MASK).toContain("websiteUri");
    expect(DETAILS_FIELD_MASK).not.toContain("reviews");
    expect(DETAILS_FIELD_MASK).not.toContain("photos");
  });

  it("normalizes a successful text search into internal candidates", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [samplePlace] }));
    const page = await searchText({ textQuery: "cafe" });

    expect(page.candidates).toHaveLength(1);
    expect(page.candidates[0]).toMatchObject({
      providerPlaceId: "ChIJ_sample_1",
      displayName: "Aguirre Garden Cafe",
      primaryType: "cafe",
      businessStatus: "OPERATIONAL",
      detailsFetched: false,
      phoneNumber: null,
      websiteUrl: null
    });
  });

  it("returns an empty page rather than throwing when there are no results", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const page = await searchText({ textQuery: "nothing here" });
    expect(page.candidates).toEqual([]);
    expect(page.nextPageToken).toBeNull();
  });

  it("passes pageToken through and surfaces nextPageToken", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [samplePlace], nextPageToken: "token-2" }));
    const page = await searchText({ textQuery: "cafe", pageToken: "token-1" });

    expect(lastRequest().body).toMatchObject({ pageToken: "token-1", textQuery: "cafe", regionCode: "PH" });
    expect(page.nextPageToken).toBe("token-2");
  });

  it("drops places missing an id or a name instead of creating unusable records", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        places: [
          samplePlace,
          { displayName: { text: "No id" } },
          { id: "ChIJ_no_name" },
          { id: "ChIJ_partial", displayName: { text: "Partial Co" } }
        ]
      })
    );
    const page = await searchText({ textQuery: "cafe" });

    expect(page.candidates.map((candidate) => candidate.providerPlaceId)).toEqual(["ChIJ_sample_1", "ChIJ_partial"]);
    // A partial place still yields a usable candidate with explicit nulls.
    expect(page.candidates[1]).toMatchObject({
      displayName: "Partial Co",
      formattedAddress: null,
      latitude: null,
      businessStatus: null,
      types: []
    });
  });

  it("preserves a permanently closed business status for downstream filtering", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ places: [{ ...samplePlace, businessStatus: "CLOSED_PERMANENTLY" }] })
    );
    const page = await searchText({ textQuery: "cafe" });
    expect(page.candidates[0].businessStatus).toBe("CLOSED_PERMANENTLY");
  });

  it("restricts nearby search to a circle and does not request nextPageToken", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [samplePlace] }));
    const page = await searchNearby({
      latitude: 14.55,
      longitude: 121.02,
      radiusMeters: 450,
      includedTypes: ["restaurant"]
    });

    const { headers, body } = lastRequest();
    expect(headers["X-Goog-FieldMask"]).toBe(DISCOVERY_FIELD_MASK);
    expect(headers["X-Goog-FieldMask"]).not.toContain("nextPageToken");
    expect(body).toMatchObject({
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      locationRestriction: { circle: { center: { latitude: 14.55, longitude: 121.02 }, radius: 450 } }
    });
    expect(page.nextPageToken).toBeNull();
  });

  it("clamps maxResultCount to Google's limit of 20", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [] }));
    await searchNearby({
      latitude: 14.55,
      longitude: 121.02,
      radiusMeters: 450,
      includedTypes: ["restaurant"],
      maxResultCount: 100
    });
    expect(lastRequest().body).toMatchObject({ maxResultCount: 20 });
  });

  it("fetches contact fields only at the details stage", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ...samplePlace,
        nationalPhoneNumber: "(02) 8123 4567",
        websiteUri: "https://aguirregarden.example",
        rating: 4.6,
        userRatingCount: 210
      })
    );
    const candidate = await placeDetails("ChIJ_sample_1");

    expect(lastRequest().headers["X-Goog-FieldMask"]).toBe(DETAILS_FIELD_MASK);
    expect(candidate).toMatchObject({
      detailsFetched: true,
      phoneNumber: "(02) 8123 4567",
      websiteUrl: "https://aguirregarden.example",
      rating: 4.6,
      userRatingCount: 210
    });
  });

  it("accepts a details id with or without the places/ prefix", async () => {
    fetchMock.mockResolvedValue(jsonResponse(samplePlace));
    await placeDetails("places/ChIJ_sample_1");
    expect(lastRequest().url).toContain("/places/ChIJ_sample_1");
  });

  it("retries a 429 with backoff and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: { message: "Quota exceeded" } }, 429))
      .mockResolvedValueOnce(jsonResponse({ places: [samplePlace] }));

    const page = await searchText({ textQuery: "cafe" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(page.candidates).toHaveLength(1);
  });

  it("retries a 5xx and gives up with a quota-safe error after the attempt limit", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "Backend error" } }, 503));

    await expect(searchText({ textQuery: "cafe" })).rejects.toMatchObject({ code: "E-PLACES-02", status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry an invalid request", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "Invalid field mask" } }, 400));

    await expect(searchText({ textQuery: "cafe" })).rejects.toMatchObject({ code: "E-PLACES-05" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a permission error", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: "API key not authorized" } }, 403));

    await expect(searchText({ textQuery: "cafe" })).rejects.toMatchObject({ code: "E-PLACES-04" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps a request timeout to a timeout error and retries it", async () => {
    const timeoutError = new Error("The operation was aborted due to timeout");
    timeoutError.name = "TimeoutError";
    fetchMock.mockRejectedValue(timeoutError);

    await expect(searchText({ textQuery: "cafe" }, { timeoutMs: 5 })).rejects.toMatchObject({ code: "E-PLACES-06" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops immediately when the caller aborts, without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    fetchMock.mockRejectedValue(new Error("aborted"));

    await expect(searchText({ textQuery: "cafe" }, { signal: controller.signal })).rejects.toMatchObject({
      code: "E-PLACES-06"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never leaks the API key in an error message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { message: "Request had invalid key=AIzaTESTKEY1234567890 supplied" } }, 400)
    );

    const error = await searchText({ textQuery: "cafe" }).catch((caught: PlacesError) => caught);

    expect(error).toBeInstanceOf(PlacesError);
    expect((error as PlacesError).message).not.toContain("AIzaTESTKEY1234567890");
    expect((error as PlacesError).message).toContain("[redacted]");
  });

  it("redacts any Google-shaped key, not just the configured one", () => {
    expect(redactSecrets("key=AIzaSyC_other_key_abcdefghijklmno")).toBe("key=[redacted]");
  });
});
