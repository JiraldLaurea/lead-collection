import { metroManilaCities } from "@/lib/philippines-locations";
import { prisma } from "@/lib/prisma";
import { findSmeCategory, smeCategories, smeCategoryKeys } from "@/lib/sme/categories";
import { runSmeSearch, type SmeSearchResult, type SmeSearchRunResult } from "@/lib/sme/run-search";
import type { ScoreBand } from "@/lib/sme/score";
import type { SearchFilters } from "@/lib/sme/types";

export const scheduledSmeSearchEnabledKey = "scheduled_sme_search_enabled";
export const scheduledSmeSearchZoneIdKey = "scheduled_sme_search_zone_id";
export const scheduledSmeSearchLocationModeKey = "scheduled_sme_search_location_mode";
export const scheduledSmeSearchCityKey = "scheduled_sme_search_city";
export const scheduledSmeSearchCategoryKey = "scheduled_sme_search_category";
export const scheduledSmeSearchCategoriesKey = "scheduled_sme_search_categories";
export const scheduledSmeSearchMaxResultsKey = "scheduled_sme_search_max_results";
export const scheduledSmeSearchMaxPerCategoryKey = "scheduled_sme_search_max_per_category";
export const scheduledSmeSearchRadiusMetersKey = "scheduled_sme_search_radius_meters";
export const scheduledSmeSearchSnapshotKey = "scheduled_sme_search_latest_snapshot";
export const scheduledSmeSearchLastRunKey = "scheduled_sme_search_last_run";

const DEFAULT_CATEGORY = "cafe_resto";
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_MAX_PER_CATEGORY = 30;
const DEFAULT_RADIUS_METERS = 100;
const SCHEDULED_DISCOVERY_MULTIPLIER = 4;
const MAX_SCHEDULED_DISCOVERY_RESULTS = 60;

/** "All NCR cities" sentinel for the City mode city input. */
export const ALL_NCR_CITIES = "ALL";

/** Classes that count as a qualified (non-franchise) SME lead. */
const QUALIFIED_CLASSES = ["INDEPENDENT_SME", "LOCAL_SME_CHAIN", "MANUAL_INCLUDE"];

export type ScheduledSmeSearchSettings = {
  enabled: boolean;
  locationMode: "STREET" | "CITY";
  zoneId: number | null;
  /** City mode: a specific NCR city, or ALL_NCR_CITIES for every NCR city. */
  city: string;
  /** Street mode single category. */
  category: string;
  /** City mode categories to sweep (defaults to all SME categories). */
  categories: string[];
  /** Street mode maximum results. */
  maxResults: number;
  /** City mode maximum qualified leads per category. */
  maxPerCategory: number;
  radiusMeters: number;
};

export type ScheduledSmeSearchSnapshot = {
  searchRunId: number;
  completedAt: string;
  zoneLabel: string;
  category: string;
  maxResults: number;
  discoveredCount: number;
  scoreBands: Partial<Record<ScoreBand, number>>;
  summary: SmeSearchRunResult["summary"];
  results: SmeSearchResult[];
};

export async function getScheduledSmeSearchSettings(): Promise<ScheduledSmeSearchSettings> {
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          scheduledSmeSearchEnabledKey,
          scheduledSmeSearchZoneIdKey,
          scheduledSmeSearchLocationModeKey,
          scheduledSmeSearchCityKey,
          scheduledSmeSearchCategoryKey,
          scheduledSmeSearchCategoriesKey,
          scheduledSmeSearchMaxResultsKey,
          scheduledSmeSearchMaxPerCategoryKey,
          scheduledSmeSearchRadiusMetersKey
        ]
      }
    }
  });
  const values = new Map(rows.map((row) => [row.key, row.value]));

  return {
    enabled: values.get(scheduledSmeSearchEnabledKey) === "true",
    locationMode: normalizeLocationMode(values.get(scheduledSmeSearchLocationModeKey)),
    zoneId: normalizeZoneId(values.get(scheduledSmeSearchZoneIdKey)),
    city: normalizeCity(values.get(scheduledSmeSearchCityKey)),
    category: normalizeCategory(values.get(scheduledSmeSearchCategoryKey)),
    categories: normalizeCategories(values.get(scheduledSmeSearchCategoriesKey)),
    maxResults: normalizeMaxResults(values.get(scheduledSmeSearchMaxResultsKey)),
    maxPerCategory: normalizeMaxPerCategory(values.get(scheduledSmeSearchMaxPerCategoryKey)),
    radiusMeters: normalizeRadius(values.get(scheduledSmeSearchRadiusMetersKey))
  };
}

export async function saveScheduledSmeSearchSettings(input: ScheduledSmeSearchSettings) {
  const settings: ScheduledSmeSearchSettings = {
    enabled: input.enabled,
    locationMode: input.locationMode === "CITY" ? "CITY" : "STREET",
    zoneId: input.zoneId,
    city: normalizeCity(input.city),
    category: normalizeCategory(input.category),
    categories: normalizeCategories(input.categories),
    maxResults: normalizeMaxResults(String(input.maxResults)),
    maxPerCategory: normalizeMaxPerCategory(String(input.maxPerCategory)),
    radiusMeters: normalizeRadius(String(input.radiusMeters))
  };

  if (settings.enabled && settings.locationMode === "STREET" && !settings.zoneId) {
    throw new Error("Choose a street before enabling scheduled search.");
  }
  if (settings.enabled && settings.locationMode === "CITY" && !settings.city) {
    throw new Error("Choose a city (or All NCR cities) before enabling scheduled search.");
  }
  if (settings.enabled && settings.locationMode === "CITY" && settings.categories.length === 0) {
    throw new Error("Select at least one category before enabling scheduled search.");
  }
  if (settings.enabled && settings.locationMode === "STREET" && settings.zoneId) {
    const zone = await prisma.smeSearchZone.findUnique({ where: { id: settings.zoneId } });
    if (!zone?.enabled || zone.latitude === null || zone.longitude === null) {
      throw new Error("The selected commercial road must be enabled and have map coordinates.");
    }
  }

  await prisma.$transaction([
    upsertSetting(scheduledSmeSearchEnabledKey, settings.enabled ? "true" : "false"),
    upsertSetting(scheduledSmeSearchZoneIdKey, settings.zoneId ? String(settings.zoneId) : ""),
    upsertSetting(scheduledSmeSearchLocationModeKey, settings.locationMode),
    upsertSetting(scheduledSmeSearchCityKey, settings.city),
    upsertSetting(scheduledSmeSearchCategoryKey, settings.category),
    upsertSetting(scheduledSmeSearchCategoriesKey, JSON.stringify(settings.categories)),
    upsertSetting(scheduledSmeSearchMaxResultsKey, String(settings.maxResults)),
    upsertSetting(scheduledSmeSearchMaxPerCategoryKey, String(settings.maxPerCategory)),
    upsertSetting(scheduledSmeSearchRadiusMetersKey, String(settings.radiusMeters))
  ]);

  return settings;
}

/** Latest completed scheduled result set. It is a snapshot so later manual searches cannot replace it. */
export async function getLatestScheduledSmeSearchSnapshot(): Promise<ScheduledSmeSearchSnapshot | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: scheduledSmeSearchSnapshotKey } });
  if (!row?.value) return null;
  try {
    const snapshot = JSON.parse(row.value) as ScheduledSmeSearchSnapshot;
    if (!Array.isArray(snapshot.results) || !Number.isInteger(snapshot.searchRunId)) return null;
    return snapshot;
  } catch {
    return null;
  }
}

export type CityCategorySweepInput = {
  /** Concrete cities to sweep. Resolve ALL_NCR_CITIES with `resolveSweepCities` before calling. */
  cities: string[];
  categories: string[];
  maxPerCategory: number;
  filters?: SearchFilters;
  signal?: AbortSignal;
};

export type CityCategorySweepResult = {
  /** Qualified (non-franchise) leads, deduped by place id across every city×category cell. */
  results: SmeSearchResult[];
  searchRunIds: number[];
  discoveredCount: number;
};

/** Expand the City-mode city input into the concrete list of cities to sweep. */
export function resolveSweepCities(city: string): string[] {
  if (city === ALL_NCR_CITIES) return metroManilaCities;
  return city ? [city] : [];
}

/**
 * Runs one CITY_CATEGORY search for every city×category cell and returns the qualified
 * (non-franchise) leads per cell. Each cell fetches exactly `maxPerCategory` businesses — no
 * wider discovery pool — because `runSmeSearch` persists every business it fetches into
 * `SmeBusinessProfile`; over-fetching would bloat the profile store (and Google spend) far past
 * the configured "max leads per category". A cell yields fewer than `maxPerCategory` only when
 * some of the fetched businesses are franchises.
 */
export async function runCityCategorySweep(input: CityCategorySweepInput): Promise<CityCategorySweepResult> {
  const discoveryMax = Math.min(input.maxPerCategory, MAX_SCHEDULED_DISCOVERY_RESULTS);
  const searchRunIds: number[] = [];
  const collected: SmeSearchResult[] = [];
  let discoveredCount = 0;

  for (const city of input.cities) {
    for (const category of input.categories) {
      const result = await runSmeSearch(
        { mode: "CITY_CATEGORY", city, category, maxResults: discoveryMax },
        { excludeDoNotContact: true, ...input.filters },
        { signal: input.signal }
      );
      searchRunIds.push(result.searchRunId);
      discoveredCount += result.results.length;
      const qualified = result.results
        .filter((item) => QUALIFIED_CLASSES.includes(item.classification.effectiveClass))
        .slice(0, input.maxPerCategory);
      collected.push(...qualified);
    }
  }

  return { results: dedupeByPlaceId(collected), searchRunIds, discoveredCount };
}

/** Called by Vercel Cron. A retry on the same UTC day is treated as a no-op. */
export async function runScheduledSmeSearch(options: { force?: boolean; local?: boolean } = {}) {
  const settings = await getScheduledSmeSearchSettings();
  if (!settings.enabled && !options.force) {
    return { processed: false, reason: "Scheduled SME search is disabled." };
  }
  if (settings.locationMode === "STREET" && !settings.zoneId) return { processed: false, reason: "No street is configured." };
  if (settings.locationMode === "CITY" && !settings.city) return { processed: false, reason: "No city is configured." };
  if (settings.locationMode === "CITY" && settings.categories.length === 0) return { processed: false, reason: "No categories are selected." };

  // Runs at most once per Manila day (hosted cron or the local tick). There is no start-time gate:
  // each category simply collects up to its max-leads-per-category, then stops.
  const today = manilaDateKey();
  if (!options.force) {
    const lastRun = await prisma.appSetting.findUnique({ where: { key: scheduledSmeSearchLastRunKey } });
    if (lastRun?.value === today) return { processed: false, reason: "Scheduled SME search already ran today." };
  }

  const snapshot = settings.locationMode === "CITY"
    ? await runCityModeScheduledSearch(settings)
    : await runStreetModeScheduledSearch(settings);
  if (!snapshot) return { processed: false, reason: "The configured street needs coordinates and must be enabled." };

  await prisma.$transaction([
    upsertSetting(scheduledSmeSearchSnapshotKey, JSON.stringify(snapshot.snapshot)),
    upsertSetting(scheduledSmeSearchLastRunKey, today),
    ...(snapshot.zoneId ? [prisma.smeSearchZone.update({ where: { id: snapshot.zoneId }, data: { lastScannedAt: new Date() } })] : [])
  ]);

  return { processed: true, resultCount: snapshot.snapshot.results.length, searchRunId: snapshot.snapshot.searchRunId };
}

/** City×category sweep across one or every NCR city; collects qualified (non-franchise) leads. */
async function runCityModeScheduledSearch(settings: ScheduledSmeSearchSettings) {
  const cities = resolveSweepCities(settings.city);
  const sweep = await runCityCategorySweep({
    cities,
    categories: settings.categories,
    maxPerCategory: settings.maxPerCategory
  });

  const categoryLabels = settings.categories
    .map((key) => smeCategories.find((category) => category.key === key)?.label ?? key)
    .join(", ");
  const cityLabel = settings.city === ALL_NCR_CITIES ? "All NCR cities" : settings.city;

  const snapshot: ScheduledSmeSearchSnapshot = {
    searchRunId: sweep.searchRunIds[0] ?? 0,
    completedAt: new Date().toISOString(),
    zoneLabel: `${cityLabel} · ${categoryLabels}`,
    category: settings.categories.join(", "),
    maxResults: settings.maxPerCategory,
    discoveredCount: sweep.discoveredCount,
    scoreBands: countScoreBands(sweep.results),
    summary: {
      total: sweep.results.length,
      qualified: sweep.results.length,
      manualReview: 0,
      excluded: 0,
      alreadySaved: sweep.results.filter((item) => item.savedLeadId !== null).length,
      errors: 0
    },
    results: sweep.results
  };

  return { snapshot, zoneId: null as number | null };
}

/** Existing single commercial-road (street) search, filtered to the Grade-A shortlist. */
async function runStreetModeScheduledSearch(settings: ScheduledSmeSearchSettings) {
  const zone = settings.zoneId ? await prisma.smeSearchZone.findUnique({ where: { id: settings.zoneId } }) : null;
  if (!zone?.enabled || zone.latitude === null || zone.longitude === null) return null;

  const discoveryMaxResults = Math.min(
    settings.maxResults * SCHEDULED_DISCOVERY_MULTIPLIER,
    MAX_SCHEDULED_DISCOVERY_RESULTS
  );

  const result = await runSmeSearch(
    {
      mode: "COMMERCIAL_ROAD",
      city: zone.city,
      commercialArea: zone.commercialArea,
      roadName: zone.roadName,
      latitude: zone.latitude,
      longitude: zone.longitude,
      radiusMeters: settings.radiusMeters,
      category: settings.category || undefined,
      keyword: settings.category ? undefined : "business",
      zonePriority: zone.priority,
      maxResults: discoveryMaxResults
    },
    { excludeDoNotContact: true }
  );

  // "Grade A only" is deliberately exact. S grade is not folded into this scheduled list.
  const gradeAResults = result.results
    .filter((item) => item.score.band === "A")
    .slice(0, settings.maxResults);

  const snapshot: ScheduledSmeSearchSnapshot = {
    searchRunId: result.searchRunId,
    completedAt: new Date().toISOString(),
    zoneLabel: `${zone.roadName} — ${zone.commercialArea}, ${zone.city}`,
    category: settings.category,
    maxResults: settings.maxResults,
    discoveredCount: result.results.length,
    scoreBands: countScoreBands(result.results),
    summary: {
      ...result.summary,
      total: gradeAResults.length,
      qualified: gradeAResults.length,
      manualReview: 0,
      excluded: 0,
      alreadySaved: gradeAResults.filter((item) => item.savedLeadId !== null).length
    },
    results: gradeAResults
  };

  return { snapshot, zoneId: zone.id as number | null };
}

function countScoreBands(results: SmeSearchResult[]) {
  return results.reduce<Partial<Record<ScoreBand, number>>>((counts, item) => {
    counts[item.score.band] = (counts[item.score.band] ?? 0) + 1;
    return counts;
  }, {});
}

function dedupeByPlaceId(results: SmeSearchResult[]) {
  const seen = new Set<string>();
  const unique: SmeSearchResult[] = [];
  for (const result of results) {
    if (seen.has(result.providerPlaceId)) continue;
    seen.add(result.providerPlaceId);
    unique.push(result);
  }
  return unique;
}

function upsertSetting(key: string, value: string) {
  return prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

function normalizeZoneId(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeLocationMode(value: string | undefined): "STREET" | "CITY" {
  return value === "CITY" ? "CITY" : "STREET";
}

function normalizeCity(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  if (trimmed === ALL_NCR_CITIES) return ALL_NCR_CITIES;
  return metroManilaCities.includes(trimmed) ? trimmed : "";
}

function normalizeCategory(value: string | undefined) {
  if (!value) return "";
  const category = findSmeCategory(value);
  return category ? value : DEFAULT_CATEGORY;
}

function normalizeCategories(value: string | string[] | undefined) {
  let list: string[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === "string" && value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const valid = list.filter((key): key is string => typeof key === "string" && smeCategoryKeys.includes(key));
  const unique = Array.from(new Set(valid));
  // Empty selection defaults to every category so a run is never silently a no-op.
  return unique.length > 0 ? unique : [...smeCategoryKeys];
}

function normalizeMaxResults(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_RESULTS;
  return Math.min(60, Math.max(1, Math.floor(parsed)));
}

function normalizeMaxPerCategory(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_PER_CATEGORY;
  return Math.min(60, Math.max(1, Math.floor(parsed)));
}

function normalizeRadius(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_METERS;
  return Math.min(50_000, Math.max(50, Math.floor(parsed)));
}

/** Manila-timezone date key (YYYY-MM-DD). Shared by scheduled search and automatic outreach day-guards. */
export function manilaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
