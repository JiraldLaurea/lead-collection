import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTextQuery, dedupeByPlaceId, runDiscovery } from "@/lib/sme/search";
import type { BusinessCandidate } from "@/lib/sme/types";

const fetchMock = vi.fn();

function place(id: string, name = `Business ${id}`) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: "Somewhere, Metro Manila",
    location: { latitude: 14.5, longitude: 121.0 },
    primaryType: "cafe",
    types: ["cafe"],
    businessStatus: "OPERATIONAL",
    googleMapsUri: "https://maps.google.com/?cid=1"
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

function requestAt(index: number) {
  const [url, init] = fetchMock.mock.calls[index] as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) as Record<string, unknown> };
}

function candidate(id: string): BusinessCandidate {
  return {
    providerPlaceId: id,
    displayName: `Business ${id}`,
    formattedAddress: null,
    latitude: null,
    longitude: null,
    primaryType: null,
    types: [],
    businessStatus: null,
    googleMapsUri: null,
    phoneNumber: null,
    websiteUrl: null,
    rating: null,
    userRatingCount: null,
    detailsFetched: false,
    fetchedAt: new Date()
  };
}

describe("SME search modes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.GOOGLE_MAPS_API_KEY = "AIzaTESTKEY1234567890";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  describe("buildTextQuery", () => {
    it("builds a natural-language query from category and place parts", () => {
      expect(
        buildTextQuery({
          mode: "COMMERCIAL_ROAD",
          category: "cafe_resto",
          roadName: "Aguirre Avenue",
          commercialArea: "BF Homes",
          city: "Paranaque"
        })
      ).toBe("cafe restaurant in Aguirre Avenue, BF Homes, Paranaque");
    });

    it("combines a keyword with the category", () => {
      expect(buildTextQuery({ mode: "CITY_CATEGORY", keyword: "independent", category: "cafe_resto", city: "Makati" })).toBe(
        "independent cafe restaurant in Makati"
      );
    });

    it("supports a free-text query with no location", () => {
      expect(buildTextQuery({ mode: "FREE_TEXT", keyword: "independent cafe in Tomas Morato" })).toBe(
        "independent cafe in Tomas Morato"
      );
    });

    it("omits parts the caller did not supply", () => {
      expect(buildTextQuery({ mode: "CITY_CATEGORY", category: "dental_clinic", city: "Pasig" })).toBe(
        "dental clinic in Pasig"
      );
    });
  });

  it("uses Nearby Search for a map-radius search with a mapped category", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [place("ChIJ1")] }));

    await runDiscovery({
      mode: "MAP_RADIUS",
      category: "dental_clinic",
      latitude: 14.553,
      longitude: 121.024,
      radiusMeters: 450
    });

    const { url, body } = requestAt(0);
    expect(url).toContain("places:searchNearby");
    expect(body).toMatchObject({
      includedTypes: ["dentist"],
      locationRestriction: { circle: { center: { latitude: 14.553, longitude: 121.024 }, radius: 450 } }
    });
  });

  it("falls back to a location-biased Text Search for a category Google has no type for", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [place("ChIJ1")] }));

    // skin_clinic has no Google place type, so Nearby Search would return nothing.
    await runDiscovery({
      mode: "MAP_RADIUS",
      category: "skin_clinic",
      latitude: 14.553,
      longitude: 121.024,
      radiusMeters: 600
    });

    const { url, body } = requestAt(0);
    expect(url).toContain("places:searchText");
    expect(body).toMatchObject({
      textQuery: "skin clinic dermatology",
      locationBias: { circle: { center: { latitude: 14.553, longitude: 121.024 }, radius: 600 } }
    });
  });

  it("uses Text Search for a commercial-road search with no coordinates", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ places: [place("ChIJ1")] }));

    await runDiscovery({
      mode: "COMMERCIAL_ROAD",
      category: "cafe_resto",
      roadName: "Aguirre Avenue",
      commercialArea: "BF Homes",
      city: "Paranaque"
    });

    const { url, body } = requestAt(0);
    expect(url).toContain("places:searchText");
    expect(body).toMatchObject({ textQuery: "cafe restaurant in Aguirre Avenue, BF Homes, Paranaque" });
  });

  it("follows nextPageToken until maxResults is reached", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ places: [place("ChIJ1"), place("ChIJ2")], nextPageToken: "t2" }))
      .mockResolvedValueOnce(jsonResponse({ places: [place("ChIJ3"), place("ChIJ4")], nextPageToken: "t3" }))
      .mockResolvedValueOnce(jsonResponse({ places: [place("ChIJ5")] }));

    const results = await runDiscovery({ mode: "FREE_TEXT", keyword: "cafe in Makati", maxResults: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestAt(1).body).toMatchObject({ pageToken: "t2", textQuery: "cafe in Makati" });
    expect(requestAt(2).body).toMatchObject({ pageToken: "t3" });
    expect(results).toHaveLength(5);
  });

  it("stops paginating once enough results are collected", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ places: [place("ChIJ1"), place("ChIJ2"), place("ChIJ3")], nextPageToken: "more" })
    );

    const results = await runDiscovery({ mode: "FREE_TEXT", keyword: "cafe", maxResults: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(2);
  });

  it("deduplicates the same place returned across pages", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ places: [place("ChIJ1"), place("ChIJ2")], nextPageToken: "t2" }))
      .mockResolvedValueOnce(jsonResponse({ places: [place("ChIJ2"), place("ChIJ3")] }));

    const results = await runDiscovery({ mode: "FREE_TEXT", keyword: "cafe", maxResults: 20 });

    expect(results.map((result) => result.providerPlaceId)).toEqual(["ChIJ1", "ChIJ2", "ChIJ3"]);
  });

  it("rejects a map-radius search with no category before spending a request", async () => {
    await expect(
      runDiscovery({ mode: "MAP_RADIUS", latitude: 14.5, longitude: 121.0, radiusMeters: 500 })
    ).rejects.toMatchObject({ code: "E-PLACES-05" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a search with nothing to search for", async () => {
    await expect(runDiscovery({ mode: "FREE_TEXT" })).rejects.toMatchObject({ code: "E-PLACES-05" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the first occurrence when deduplicating", () => {
    const unique = dedupeByPlaceId([candidate("a"), candidate("b"), candidate("a")]);
    expect(unique.map((item) => item.providerPlaceId)).toEqual(["a", "b"]);
  });
});
