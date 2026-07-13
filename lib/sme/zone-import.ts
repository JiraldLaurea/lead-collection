import { parseCsv } from "@/lib/csv-import";
import { prisma } from "@/lib/prisma";

export type SearchZoneInput = {
  city: string;
  commercialArea: string;
  roadName: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  priority: string;
  enabled: boolean;
};

export type RowError = { row: number; message: string };

export type ZoneParseResult = {
  zones: SearchZoneInput[];
  errors: RowError[];
};

export type ZoneImportResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: RowError[];
  zones: SearchZoneInput[];
};

const headerAliases: Record<keyof SearchZoneInput, string[]> = {
  city: ["city"],
  commercialArea: ["commercial area", "area", "commercial district", "district"],
  roadName: ["road name", "road", "street", "commercial road"],
  latitude: ["latitude", "lat"],
  longitude: ["longitude", "lng", "lon", "long"],
  radiusMeters: ["default radius m", "radius m", "radius", "search radius", "radius meters"],
  priority: ["priority"],
  enabled: ["enabled", "active"]
};

const validPriorities = ["A+", "A", "B+", "B", "C"];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
}

function cell(row: string[], index: number) {
  if (index < 0 || index >= row.length) return "";
  return (row[index] ?? "").trim();
}

export function parseSearchZoneCsv(text: string): ZoneParseResult {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.includes("city") && normalized.some((header) => headerAliases.roadName.includes(header));
  });
  if (headerIndex < 0) {
    throw new Error('Could not find a header row with "City" and "Road Name" columns.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const indexOf = (field: keyof SearchZoneInput) =>
    headers.findIndex((header) => headerAliases[field].includes(header));

  const columns = {
    city: indexOf("city"),
    commercialArea: indexOf("commercialArea"),
    roadName: indexOf("roadName"),
    latitude: indexOf("latitude"),
    longitude: indexOf("longitude"),
    radiusMeters: indexOf("radiusMeters"),
    priority: indexOf("priority"),
    enabled: indexOf("enabled")
  };

  const zones: SearchZoneInput[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    if (row.every((value) => !value.trim())) return;

    const city = cell(row, columns.city);
    const roadName = cell(row, columns.roadName);
    const commercialArea = cell(row, columns.commercialArea);

    if (!city || !roadName) {
      errors.push({ row: rowNumber, message: "City and Road Name are required" });
      return;
    }

    const latitudeRaw = cell(row, columns.latitude);
    const longitudeRaw = cell(row, columns.longitude);
    const latitude = latitudeRaw ? Number(latitudeRaw) : null;
    const longitude = longitudeRaw ? Number(longitudeRaw) : null;

    if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
      errors.push({ row: rowNumber, message: `Invalid latitude "${latitudeRaw}"` });
      return;
    }
    if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
      errors.push({ row: rowNumber, message: `Invalid longitude "${longitudeRaw}"` });
      return;
    }
    // A lone coordinate is a data-entry error: Nearby Search needs both or neither.
    if ((latitude === null) !== (longitude === null)) {
      errors.push({ row: rowNumber, message: "Latitude and longitude must be provided together" });
      return;
    }

    const radiusRaw = cell(row, columns.radiusMeters);
    const radiusMeters = radiusRaw ? Number(radiusRaw) : 500;
    if (!Number.isFinite(radiusMeters) || radiusMeters < 50 || radiusMeters > 50000) {
      errors.push({ row: rowNumber, message: `Invalid radius "${radiusRaw}" (expected 50-50000 m)` });
      return;
    }

    const priorityRaw = cell(row, columns.priority).toUpperCase();
    const priority = priorityRaw || "B";
    if (!validPriorities.includes(priority)) {
      errors.push({ row: rowNumber, message: `Invalid priority "${priorityRaw}" (expected A+, A, B+, B or C)` });
      return;
    }

    const enabledRaw = cell(row, columns.enabled).toLowerCase();
    const enabled = enabledRaw ? !["false", "0", "no", "n"].includes(enabledRaw) : true;

    const key = `${city.toLowerCase()}|${commercialArea.toLowerCase()}|${roadName.toLowerCase()}`;
    if (seen.has(key)) {
      errors.push({ row: rowNumber, message: `Duplicate zone in file: ${city} / ${commercialArea} / ${roadName}` });
      return;
    }
    seen.add(key);

    zones.push({
      city,
      commercialArea,
      roadName,
      latitude,
      longitude,
      radiusMeters: Math.round(radiusMeters),
      priority,
      enabled
    });
  });

  return { zones, errors };
}

/**
 * Imports zones idempotently. Re-running the same file updates in place rather than
 * duplicating, because (city, commercialArea, roadName) is unique.
 */
export async function importSearchZones(
  text: string,
  options: { dryRun?: boolean } = {}
): Promise<ZoneImportResult> {
  const dryRun = options.dryRun ?? false;
  const { zones, errors } = parseSearchZoneCsv(text);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const zone of zones) {
    const existing = await prisma.smeSearchZone.findUnique({
      where: {
        city_commercialArea_roadName: {
          city: zone.city,
          commercialArea: zone.commercialArea,
          roadName: zone.roadName
        }
      }
    });

    if (!existing) {
      created += 1;
      if (!dryRun) await prisma.smeSearchZone.create({ data: zone });
      continue;
    }

    const differs =
      existing.latitude !== zone.latitude ||
      existing.longitude !== zone.longitude ||
      existing.radiusMeters !== zone.radiusMeters ||
      existing.priority !== zone.priority ||
      existing.enabled !== zone.enabled;

    if (!differs) {
      unchanged += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await prisma.smeSearchZone.update({ where: { id: existing.id }, data: zone });
    }
  }

  return { dryRun, created, updated, unchanged, errors, zones };
}
