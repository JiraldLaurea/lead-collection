import { prisma } from "@/lib/prisma";
import { findSmeCategory } from "@/lib/sme/categories";
import { runSmeSearch, type SmeSearchResult, type SmeSearchRunResult } from "@/lib/sme/run-search";
import type { ScoreBand } from "@/lib/sme/score";

export const scheduledSmeSearchEnabledKey = "scheduled_sme_search_enabled";
export const scheduledSmeSearchZoneIdKey = "scheduled_sme_search_zone_id";
export const scheduledSmeSearchLocationModeKey = "scheduled_sme_search_location_mode";
export const scheduledSmeSearchCityKey = "scheduled_sme_search_city";
export const scheduledSmeSearchCategoryKey = "scheduled_sme_search_category";
export const scheduledSmeSearchMaxResultsKey = "scheduled_sme_search_max_results";
export const scheduledSmeSearchRadiusMetersKey = "scheduled_sme_search_radius_meters";
export const scheduledSmeSearchLocalTimeKey = "scheduled_sme_search_local_time";
export const scheduledSmeSearchSnapshotKey = "scheduled_sme_search_latest_snapshot";
export const scheduledSmeSearchLastRunKey = "scheduled_sme_search_last_run";

const DEFAULT_CATEGORY = "cafe";
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_RADIUS_METERS = 100;
const DEFAULT_LOCAL_TIME = "09:00";
const SCHEDULED_DISCOVERY_MULTIPLIER = 4;
const MAX_SCHEDULED_DISCOVERY_RESULTS = 60;

export type ScheduledSmeSearchSettings = {
  enabled: boolean;
  locationMode: "STREET" | "CITY";
  zoneId: number | null;
  city: string;
  category: string;
  maxResults: number;
  radiusMeters: number;
  localTime: string;
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
          scheduledSmeSearchMaxResultsKey,
          scheduledSmeSearchRadiusMetersKey,
          scheduledSmeSearchLocalTimeKey
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
    maxResults: normalizeMaxResults(values.get(scheduledSmeSearchMaxResultsKey)),
    radiusMeters: normalizeRadius(values.get(scheduledSmeSearchRadiusMetersKey)),
    localTime: normalizeTime(values.get(scheduledSmeSearchLocalTimeKey))
  };
}

export async function saveScheduledSmeSearchSettings(input: ScheduledSmeSearchSettings) {
  const settings: ScheduledSmeSearchSettings = {
    enabled: input.enabled,
    locationMode: input.locationMode === "CITY" ? "CITY" : "STREET",
    zoneId: input.zoneId,
    city: normalizeCity(input.city),
    category: normalizeCategory(input.category),
    maxResults: normalizeMaxResults(String(input.maxResults)),
    radiusMeters: normalizeRadius(String(input.radiusMeters)),
    localTime: normalizeTime(input.localTime)
  };

  if (settings.enabled && settings.locationMode === "STREET" && !settings.zoneId) {
    throw new Error("Choose a street before enabling scheduled search.");
  }
  if (settings.enabled && settings.locationMode === "CITY" && !settings.city) {
    throw new Error("Choose a city before enabling scheduled search.");
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
    upsertSetting(scheduledSmeSearchMaxResultsKey, String(settings.maxResults)),
    upsertSetting(scheduledSmeSearchRadiusMetersKey, String(settings.radiusMeters)),
    upsertSetting(scheduledSmeSearchLocalTimeKey, settings.localTime)
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

/** Called by Vercel Cron. A retry on the same UTC day is treated as a no-op. */
export async function runScheduledSmeSearch(options: { force?: boolean; local?: boolean } = {}) {
  const settings = await getScheduledSmeSearchSettings();
  if (!settings.enabled && !options.force) {
    return { processed: false, reason: "Scheduled SME search is disabled." };
  }
  if (settings.locationMode === "STREET" && !settings.zoneId) return { processed: false, reason: "No street is configured." };
  if (settings.locationMode === "CITY" && !settings.city) return { processed: false, reason: "No city is configured." };

  if (options.local && !options.force && !isLocalScheduleDue(settings)) {
    return { processed: false, reason: `Waiting for ${settings.localTime} Manila time.` };
  }

  const zone = settings.locationMode === "STREET" && settings.zoneId
    ? await prisma.smeSearchZone.findUnique({ where: { id: settings.zoneId } })
    : null;
  if (settings.locationMode === "STREET" && (!zone?.enabled || zone.latitude === null || zone.longitude === null)) {
    return { processed: false, reason: "The configured street needs coordinates and must be enabled." };
  }

  const today = manilaDateKey();
  if (!options.force) {
    const lastRun = await prisma.appSetting.findUnique({ where: { key: scheduledSmeSearchLastRunKey } });
    if (lastRun?.value === today) return { processed: false, reason: "Scheduled SME search already ran today." };
  }

  // The configured limit is the desired Grade-A shortlist size. Fetch a wider candidate
  // pool first because grading happens only after Google discovery and enrichment.
  const discoveryMaxResults = Math.min(
    settings.maxResults * SCHEDULED_DISCOVERY_MULTIPLIER,
    MAX_SCHEDULED_DISCOVERY_RESULTS
  );

  const result = await runSmeSearch(
    settings.locationMode === "CITY"
      ? {
          mode: "CITY_CATEGORY",
          city: settings.city,
          category: settings.category || undefined,
          keyword: settings.category ? undefined : "business",
          maxResults: discoveryMaxResults
        }
      : {
          mode: "COMMERCIAL_ROAD",
          city: zone!.city,
          commercialArea: zone!.commercialArea,
          roadName: zone!.roadName,
          latitude: zone!.latitude!,
          longitude: zone!.longitude!,
          radiusMeters: settings.radiusMeters,
          category: settings.category || undefined,
          // A street name alone resolves to the street/place record. Give an Any-category search
          // an explicit business intent so Places returns businesses near that street instead.
          keyword: settings.category ? undefined : "business",
          zonePriority: zone!.priority,
          maxResults: discoveryMaxResults
        },
    { excludeDoNotContact: true }
  );

  // "Grade A only" is deliberately exact. S grade is not folded into this scheduled list.
  const gradeAResults = result.results
    .filter((item) => item.score.band === "A")
    .slice(0, settings.maxResults);
  const scoreBands = result.results.reduce<Partial<Record<ScoreBand, number>>>((counts, item) => {
    counts[item.score.band] = (counts[item.score.band] ?? 0) + 1;
    return counts;
  }, {});
  const snapshot: ScheduledSmeSearchSnapshot = {
    searchRunId: result.searchRunId,
    completedAt: new Date().toISOString(),
    zoneLabel: settings.locationMode === "CITY" ? settings.city : `${zone!.roadName} — ${zone!.commercialArea}, ${zone!.city}`,
    category: settings.category,
    maxResults: settings.maxResults,
    discoveredCount: result.results.length,
    scoreBands,
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

  await prisma.$transaction([
    upsertSetting(scheduledSmeSearchSnapshotKey, JSON.stringify(snapshot)),
    upsertSetting(scheduledSmeSearchLastRunKey, today),
    ...(zone ? [prisma.smeSearchZone.update({ where: { id: zone.id }, data: { lastScannedAt: new Date() } })] : [])
  ]);

  return { processed: true, resultCount: gradeAResults.length, searchRunId: result.searchRunId };
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
  return value?.trim().slice(0, 100) ?? "";
}

function normalizeCategory(value: string | undefined) {
  if (!value) return "";
  const category = value ? findSmeCategory(value) : null;
  return category && category.googleTypes.length > 0 ? value! : DEFAULT_CATEGORY;
}

function normalizeMaxResults(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_RESULTS;
  return Math.min(60, Math.max(1, Math.floor(parsed)));
}

function normalizeRadius(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_RADIUS_METERS;
  return Math.min(50_000, Math.max(50, Math.floor(parsed)));
}

function normalizeTime(value: string | undefined) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return DEFAULT_LOCAL_TIME;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return DEFAULT_LOCAL_TIME;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function isLocalScheduleDue(settings: ScheduledSmeSearchSettings, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("hour")}:${value("minute")}` >= settings.localTime;
}

function manilaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
