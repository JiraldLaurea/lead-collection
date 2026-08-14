import { prisma } from "@/lib/prisma";
import { buildLeadWhere, LeadFilters } from "@/lib/leads";

type ExportLead = Awaited<ReturnType<typeof getExportLeads>>[number];

const columns = [
  "placeId",
  "businessName",
  "category",
  "formattedAddress",
  "phoneNumber",
  "email",
  "emailStatus",
  "emailSource",
  "emailCheckedAt",
  "websiteUrl",
  "googleMapsUrl",
  "rating",
  "reviewCount",
  "businessStatus",
  "searchKeyword",
  "searchLocation",
  "collectedAt"
] as const;

export async function getExportLeads(filters: LeadFilters) {
  return prisma.lead.findMany({
    where: buildLeadWhere(filters),
    orderBy: { collectedAt: "desc" }
  });
}

export async function getExportLeadsByIds(ids: number[]) {
  return prisma.lead.findMany({
    where: { id: { in: ids } },
    orderBy: { collectedAt: "desc" }
  });
}

export function leadsToCsv(leads: ExportLead[]) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = columns.join(",");
  const rows = leads.map((lead) => {
    const exportLead = formatLeadForExport(lead);
    return columns.map((column) => escape(exportLead[column])).join(",");
  });
  return [header, ...rows].join("\n");
}

/**
 * A phone export is an outreach list, so an opted-out number must never appear in it —
 * once the file leaves the app there is no second chance to filter it (work order 12.5).
 * Pass the suppression set from `getSuppressedPhones()`.
 */
export function leadsToPhoneCsv(leads: ExportLead[], suppressedPhones: Set<string> = new Set()) {
  const seenPhones = new Set<string>();
  const rows = leads.flatMap((lead) => {
    const phone = normalizePhilippineMobileNumber(lead.phoneNumber);
    if (!phone || seenPhones.has(phone) || suppressedPhones.has(phone)) return [];
    seenPhones.add(phone);
    return [phone];
  });

  return ["number", ...rows].join("\n");
}

export async function leadsToXlsx(leads: ExportLead[]) {
  // Lazily loaded so the whole exceljs graph (and its `tmp` dependency, which registers a
  // process 'exit' handler on every module eval) is not pulled into the many modules that only
  // import this file for helpers like `normalizePhilippineMobileNumber`. Static import made every
  // Next.js dev recompile stack another exit listener → MaxListenersExceededWarning.
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Leads");
  sheet.columns = columns.map((key) => ({ key, header: key, width: 24 }));
  leads.forEach((lead) => sheet.addRow(formatLeadForExport(lead)));
  return workbook.xlsx.writeBuffer();
}

export function exportFilename(format: "csv" | "xlsx", filters: LeadFilters) {
  const date = new Date().toISOString().slice(0, 10);
  const parts = ["leads", filters.area, filters.keyword, date].filter(Boolean);
  return `${parts.join("_").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.${format}`;
}

export function phoneExportFilename(filters: LeadFilters) {
  const date = new Date().toISOString().slice(0, 10);
  const parts = ["bliply_phone_numbers", filters.area, filters.keyword, date].filter(Boolean);
  return `${parts.join("_").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase()}.csv`;
}

function formatLeadForExport(lead: ExportLead) {
  return {
    ...lead,
    placeId: lead.placeId.replace(/^serper:/, "")
  };
}

export function normalizePhilippineMobileNumber(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  return null;
}
