import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

type PlacesSearchInput = {
  country: string;
  cityArea: string;
  keyword?: string;
  searchType: "TEXT_SEARCH" | "NEARBY_SEARCH";
  includedType?: string;
  radius?: number;
  latitude?: number;
  longitude?: number;
  maxResults: number;
};

type SerperPlace = {
  cid?: string;
  placeId?: string;
  title?: string;
  name?: string;
  address?: string;
  category?: string;
  type?: string;
  types?: string[];
  phoneNumber?: string;
  phone?: string;
  website?: string;
  websiteUrl?: string;
  link?: string;
  googleUrl?: string;
  rating?: number;
  ratingCount?: number;
  reviews?: number;
  latitude?: number;
  longitude?: number;
};

type SerperPlacesResponse = {
  places?: SerperPlace[];
  error?: string | { message?: string };
  message?: string;
};

const excludedLeadCategories = [
  "amusement park",
  "aquarium",
  "art gallery",
  "campground",
  "cemetery",
  "church",
  "city hall",
  "courthouse",
  "embassy",
  "government",
  "library",
  "mosque",
  "museum",
  "park",
  "parking",
  "playground",
  "police",
  "post office",
  "school",
  "stadium",
  "synagogue",
  "tourist attraction",
  "university",
  "zoo"
];

function isLeadTarget(place: SerperPlace) {
  const categories = [place.category, place.type, ...(place.types || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return !excludedLeadCategories.some((excluded) => categories.includes(excluded));
}

function apiKey() {
  const key = process.env.SERPER_API_KEY;
  if (!key || key === "replace_with_serper_api_key") {
    throw new Error("E-SEARCH-01");
  }
  return key;
}

async function callSerperPlaces(input: PlacesSearchInput): Promise<SerperPlace[]> {
  const query = `${input.keyword || ""} in ${input.cityArea}, ${input.country}`.trim();
  const places: SerperPlace[] = [];
  const seen = new Set<string>();
  const maxPages = getSerperMaxPages();
  const candidateLimit = input.maxResults * maxPages;

  for (let page = 1; page <= maxPages && places.length < candidateLimit; page += 1) {
    const pagePlaces = await fetchSerperPlacesPage(input, query, page);
    let newPlaces = 0;

    for (const place of pagePlaces) {
      const dedupeKey = getSerperPlaceDedupeKey(place);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      places.push(place);
      newPlaces += 1;
      if (places.length >= candidateLimit) break;
    }

    if (pagePlaces.length === 0 || newPlaces === 0) break;
  }

  return places.filter(isLeadTarget);
}

async function fetchSerperPlacesPage(input: PlacesSearchInput, query: string, page: number) {
  const response = await fetch("https://google.serper.dev/places", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey()
    },
    body: JSON.stringify({
      q: query,
      location: `${input.cityArea}, ${input.country}`,
      gl: "ph",
      hl: "en",
      num: input.maxResults,
      page
    })
  });

  const json = (await response.json()) as SerperPlacesResponse;
  if (!response.ok) {
    throw new Error(getSerperErrorMessage(json) || "Serper Places request failed");
  }
  return json.places || [];
}

export async function runPlacesSearch(input: PlacesSearchInput) {
  if (input.maxResults < 1 || input.maxResults > 30) {
    throw new Error("E-SEARCH-03");
  }

  const location = `${input.cityArea}, ${input.country}`;
  const searchKeyword = input.keyword || "places_search";
  const job = await prisma.searchJob.create({
    data: {
      searchKeyword,
      searchLocation: location,
      searchType: input.searchType,
      status: "RUNNING",
      startedAt: new Date()
    }
  });

  try {
    const places = await callSerperPlaces(input);
    let saved = 0;
    let duplicates = 0;
    const savedLeadIds: number[] = [];
    for (const place of places) {
      if (saved >= input.maxResults) break;
      const businessName = place.title || place.name;
      if (!businessName) continue;

      const placeId = getPlaceId(place, businessName, location);
      const existing = await prisma.lead.findUnique({ where: { placeId } });
      if (existing) {
        duplicates += 1;
        continue;
      }

      const lead = await prisma.lead.create({
        data: {
          placeId,
          businessName,
          category: place.category || place.type || place.types?.[0],
          formattedAddress: place.address,
          phoneNumber: place.phoneNumber || place.phone,
          websiteUrl: place.website || place.websiteUrl,
          googleMapsUrl: getGoogleMapsUrl(place, businessName, location),
          rating: place.rating,
          reviewCount: place.ratingCount ?? place.reviews,
          businessStatus: undefined,
          openingHours: undefined,
          searchKeyword,
          searchLocation: location,
          source: "serper_places_api",
          collectedAt: new Date(),
          lastRefreshedAt: new Date()
        }
      });
      savedLeadIds.push(lead.id);
      saved += 1;
    }
    const updatedJob = await prisma.searchJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        totalFound: places.length,
        totalSaved: saved,
        totalDuplicates: duplicates,
        finishedAt: new Date()
      }
    });
    return { ...updatedJob, savedLeadIds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Serper Places error";
    await prisma.apiErrorLog.create({
      data: {
        provider: "serper_places_api",
        endpoint: "places",
        errorCode: message.startsWith("E-") ? message : "E-SEARCH-02",
        errorMessage: message,
        requestContext: JSON.stringify({ keyword: searchKeyword, location })
      }
    });
    await prisma.searchJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: message, finishedAt: new Date() }
    });
    throw error;
  }
}

function getSerperErrorMessage(json: SerperPlacesResponse) {
  if (!json.error) return json.message;
  return typeof json.error === "string" ? json.error : json.error.message;
}

function getSerperMaxPages() {
  const parsed = Number(process.env.SERPER_PLACES_MAX_PAGES || 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

function getPlaceId(place: SerperPlace, businessName: string, location: string) {
  const nativeId = place.placeId || place.cid;
  if (nativeId) return `serper:${nativeId}`;

  const stableText = [
    businessName,
    place.address,
    place.phoneNumber || place.phone,
    place.website || place.websiteUrl,
    location
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
  return `serper:${createHash("sha1").update(stableText).digest("hex")}`;
}

function getSerperPlaceDedupeKey(place: SerperPlace) {
  if (place.placeId) return `place:${place.placeId}`;
  if (place.cid) return `cid:${place.cid}`;
  return [
    place.title || place.name,
    place.address,
    place.phoneNumber || place.phone,
    place.website || place.websiteUrl
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();
}

function getGoogleMapsUrl(place: SerperPlace, businessName: string, location: string) {
  if (place.googleUrl) return place.googleUrl;
  if (place.link) return place.link;
  if (place.cid) return `https://www.google.com/maps?cid=${encodeURIComponent(place.cid)}`;
  const query = encodeURIComponent(`${businessName} ${place.address || location}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
