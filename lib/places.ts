import { prisma } from "@/lib/prisma";
import { getCityCoordinates } from "@/lib/philippines-locations";

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

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  regularOpeningHours?: unknown;
  types?: string[];
};

const excludedLeadTypes = new Set([
  "amusement_park",
  "aquarium",
  "art_gallery",
  "campground",
  "cemetery",
  "church",
  "city_hall",
  "courthouse",
  "embassy",
  "hindu_temple",
  "library",
  "local_government_office",
  "mosque",
  "museum",
  "park",
  "parking",
  "playground",
  "police",
  "post_office",
  "rv_park",
  "school",
  "secondary_school",
  "stadium",
  "synagogue",
  "tourist_attraction",
  "university",
  "zoo"
]);

function isLeadTarget(place: GooglePlace) {
  const types = place.types || [];
  return !types.some((type) => excludedLeadTypes.has(type));
}

function apiKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || key === "replace_with_server_side_api_key") {
    throw new Error("E-SEARCH-01");
  }
  return key;
}

function fieldMask() {
  return process.env.GOOGLE_PLACES_FIELD_MASK || "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.rating,places.userRatingCount,places.businessStatus,places.types";
}

async function callPlaces(input: PlacesSearchInput): Promise<GooglePlace[]> {
  const coordinates = getCityCoordinates(input.cityArea);
  const headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": apiKey(),
    "X-Goog-FieldMask": fieldMask()
  };

  const textQuery = `${input.keyword || ""} in ${input.cityArea}, ${input.country}`.trim();
  const url =
    input.searchType === "TEXT_SEARCH"
      ? "https://places.googleapis.com/v1/places:searchText"
      : "https://places.googleapis.com/v1/places:searchNearby";
  const body =
    input.searchType === "TEXT_SEARCH"
      ? { textQuery, maxResultCount: input.maxResults }
      : {
        maxResultCount: input.maxResults,
          includedTypes: input.includedType ? [input.includedType] : undefined,
          locationRestriction: {
            circle: {
              center: {
                latitude: input.latitude ?? coordinates?.latitude ?? 14.5995,
                longitude: input.longitude ?? coordinates?.longitude ?? 120.9842
              },
              radius: input.radius ?? 1000
            }
          }
        };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const json = (await response.json()) as { places?: GooglePlace[]; error?: { message?: string; code?: number } };
  if (!response.ok) {
    throw new Error(json.error?.message || "Google Places API request failed");
  }
  return (json.places || []).filter(isLeadTarget).slice(0, input.maxResults);
}

export async function runPlacesSearch(input: PlacesSearchInput) {
  if (input.maxResults < 1 || input.maxResults > 60) {
    throw new Error("E-SEARCH-03");
  }

  const location = `${input.cityArea}, ${input.country}`;
  const searchKeyword = input.keyword || "nearby_search";
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
    const places = await callPlaces(input);
    let saved = 0;
    let duplicates = 0;
    const savedLeadIds: number[] = [];
    for (const place of places) {
      if (!place.id || !place.displayName?.text) continue;
      const existing = await prisma.lead.findUnique({ where: { placeId: place.id } });
      if (existing) {
        duplicates += 1;
        continue;
      }
      const lead = await prisma.lead.create({
        data: {
          placeId: place.id,
          businessName: place.displayName.text,
          category: place.types?.[0],
          formattedAddress: place.formattedAddress,
          phoneNumber: place.nationalPhoneNumber || place.internationalPhoneNumber,
          websiteUrl: place.websiteUri,
          googleMapsUrl: place.googleMapsUri,
          rating: place.rating,
          reviewCount: place.userRatingCount,
          businessStatus: place.businessStatus,
          openingHours: place.regularOpeningHours ? JSON.stringify(place.regularOpeningHours) : undefined,
          searchKeyword,
          searchLocation: location,
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
    const message = error instanceof Error ? error.message : "Unknown Places API error";
    await prisma.apiErrorLog.create({
      data: {
        provider: "google_places_api",
        endpoint: input.searchType,
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
