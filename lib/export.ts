import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere, LeadFilters } from "@/lib/leads";

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

export function leadsToCsv(leads: Awaited<ReturnType<typeof getExportLeads>>) {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const header = columns.join(",");
  const rows = leads.map((lead) => {
    const exportLead = formatLeadForExport(lead);
    return columns.map((column) => escape(exportLead[column])).join(",");
  });
  return [header, ...rows].join("\n");
}

export async function leadsToXlsx(leads: Awaited<ReturnType<typeof getExportLeads>>) {
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

function formatLeadForExport(lead: Awaited<ReturnType<typeof getExportLeads>>[number]) {
  return {
    ...lead,
    placeId: lead.placeId.replace(/^serper:/, "")
  };
}
