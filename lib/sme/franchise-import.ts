import { parseCsv } from "@/lib/csv-import";
import { normalizeBusinessName, normalizeWebsiteHost } from "@/lib/sme/normalize-name";
import { prisma } from "@/lib/prisma";
import type { RowError } from "@/lib/sme/zone-import";

export type FranchiseBrandInput = {
  canonicalName: string;
  normalizedName: string;
  aliases: string;
  normalizedAliases: string;
  officialDomains: string;
  category: string | null;
  scope: string;
  classification: string;
  active: boolean;
  notes: string | null;
};

export type FranchiseImportResult = {
  dryRun: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: RowError[];
  brands: FranchiseBrandInput[];
};

const validClassifications = ["KNOWN_FRANCHISE", "LARGE_CHAIN", "LOCAL_CHAIN", "ALLOWLIST"];

const headerAliases = {
  canonicalName: ["canonical name", "brand", "brand name", "name"],
  aliases: ["aliases", "alias"],
  officialDomains: ["official domains", "domains", "domain"],
  category: ["category"],
  scope: ["scope", "country scope", "country"],
  classification: ["classification", "type"],
  active: ["active", "enabled"],
  notes: ["notes", "note", "review notes"]
} as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cell(row: string[], index: number) {
  if (index < 0 || index >= row.length) return "";
  return (row[index] ?? "").trim();
}

/** Splits a semicolon- or pipe-separated list cell. Commas are not used: brand names contain them. */
function splitList(value: string) {
  return value
    .split(/[;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseFranchiseCsv(text: string) {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return normalized.some((header) => (headerAliases.canonicalName as readonly string[]).includes(header));
  });
  if (headerIndex < 0) {
    throw new Error('Could not find a header row with a "Canonical Name" column.');
  }

  const headers = rows[headerIndex].map(normalizeHeader);
  const indexOf = (field: keyof typeof headerAliases) =>
    headers.findIndex((header) => (headerAliases[field] as readonly string[]).includes(header));

  const columns = {
    canonicalName: indexOf("canonicalName"),
    aliases: indexOf("aliases"),
    officialDomains: indexOf("officialDomains"),
    category: indexOf("category"),
    scope: indexOf("scope"),
    classification: indexOf("classification"),
    active: indexOf("active"),
    notes: indexOf("notes")
  };

  const brands: FranchiseBrandInput[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const rowNumber = headerIndex + offset + 2;
    if (row.every((value) => !value.trim())) return;

    const canonicalName = cell(row, columns.canonicalName);
    if (!canonicalName) {
      errors.push({ row: rowNumber, message: "Canonical Name is required" });
      return;
    }

    const normalizedName = normalizeBusinessName(canonicalName);
    if (!normalizedName) {
      errors.push({ row: rowNumber, message: `"${canonicalName}" normalizes to an empty name` });
      return;
    }

    if (seen.has(normalizedName)) {
      errors.push({ row: rowNumber, message: `Duplicate brand in file: ${canonicalName}` });
      return;
    }
    seen.add(normalizedName);

    const classification = (cell(row, columns.classification) || "KNOWN_FRANCHISE").toUpperCase();
    if (!validClassifications.includes(classification)) {
      errors.push({
        row: rowNumber,
        message: `Invalid classification "${classification}" (expected ${validClassifications.join(", ")})`
      });
      return;
    }

    const aliases = splitList(cell(row, columns.aliases));
    // Match on the normalized form, so "McDo", "McDonald's" and "MCDONALDS" all collapse together.
    const normalizedAliases = [normalizedName, ...aliases.map(normalizeBusinessName)].filter(Boolean);

    const domains = splitList(cell(row, columns.officialDomains))
      .map((domain) => normalizeWebsiteHost(domain))
      .filter((domain): domain is string => Boolean(domain));

    const activeRaw = cell(row, columns.active).toLowerCase();
    const active = activeRaw ? !["false", "0", "no", "n"].includes(activeRaw) : true;

    brands.push({
      canonicalName,
      normalizedName,
      aliases: aliases.join(";"),
      normalizedAliases: Array.from(new Set(normalizedAliases)).join(";"),
      officialDomains: Array.from(new Set(domains)).join(";"),
      category: cell(row, columns.category) || null,
      scope: cell(row, columns.scope) || "PH",
      classification,
      active,
      notes: cell(row, columns.notes) || null
    });
  });

  return { brands, errors };
}

/** Idempotent by canonical name: re-importing the template updates rather than duplicates. */
export async function importFranchiseBrands(
  text: string,
  options: { dryRun?: boolean } = {}
): Promise<FranchiseImportResult> {
  const dryRun = options.dryRun ?? false;
  const { brands, errors } = parseFranchiseCsv(text);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const brand of brands) {
    const existing = await prisma.franchiseBrand.findUnique({
      where: { canonicalName: brand.canonicalName }
    });

    if (!existing) {
      created += 1;
      if (!dryRun) await prisma.franchiseBrand.create({ data: brand });
      continue;
    }

    const differs =
      existing.normalizedAliases !== brand.normalizedAliases ||
      existing.officialDomains !== brand.officialDomains ||
      existing.classification !== brand.classification ||
      existing.active !== brand.active ||
      existing.category !== brand.category;

    if (!differs) {
      unchanged += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      await prisma.franchiseBrand.update({ where: { id: existing.id }, data: brand });
    }
  }

  return { dryRun, created, updated, unchanged, errors, brands };
}
