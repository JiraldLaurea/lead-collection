export type CsvLeadInput = {
  clientId: string | null;
  businessName: string;
  industry: string | null;
  cityArea: string | null;
  priority: string | null;
  leadSource: string | null;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
  socialUrl: string | null;
  status: string | null;
  packageName: string | null;
  estimatedMonthlyFee: string | null;
  adBudget: string | null;
  lastContact: string | null;
  nextFollowUp: string | null;
  owner: string | null;
  mainGoal: string | null;
  notes: string | null;
};

const columnAliases: Record<keyof CsvLeadInput, string[]> = {
  clientId: ["client id", "lead id", "id"],
  businessName: ["business name", "company", "company name", "name"],
  industry: ["industry", "category"],
  cityArea: ["city area", "city", "area", "location"],
  priority: ["priority"],
  leadSource: ["lead source", "source"],
  contactName: ["contact name", "contact", "contact person"],
  phoneNumber: ["phone", "phone number", "mobile", "mobile number"],
  email: ["email", "email address"],
  socialUrl: ["facebook ig tiktok url", "social url", "website", "website url"],
  status: ["status", "lead status"],
  packageName: ["package", "package name"],
  estimatedMonthlyFee: ["estimated monthly fee", "monthly fee"],
  adBudget: ["ad budget", "advertising budget"],
  lastContact: ["last contact", "last contacted"],
  nextFollowUp: ["next follow up", "follow up", "follow-up"],
  owner: ["owner", "assigned to"],
  mainGoal: ["main goal", "goal"],
  notes: ["notes", "note"]
};

export function parseCsvLeads(text: string) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    return columnAliases.businessName.some((alias) => normalized.includes(normalizeHeader(alias)));
  });
  if (headerIndex < 0) throw new Error('Could not find a "Business Name" column.');

  const headers = rows[headerIndex].map(normalizeHeader);
  const indexes = Object.fromEntries(
    Object.entries(columnAliases).map(([field, aliases]) => [
      field,
      headers.findIndex((header) => aliases.some((alias) => header === normalizeHeader(alias)))
    ])
  ) as Record<keyof CsvLeadInput, number>;

  const skippedRows: number[] = [];
  const leads = rows.slice(headerIndex + 1).flatMap((row, offset) => {
    if (row.every((value) => !value.trim())) return [];
    const value = (field: keyof CsvLeadInput) => cleanCell(indexes[field] >= 0 ? row[indexes[field]] : "");
    const businessName = value("businessName");
    if (!businessName) {
      skippedRows.push(headerIndex + offset + 2);
      return [];
    }
    return [{
      clientId: value("clientId"),
      businessName,
      industry: value("industry"),
      cityArea: value("cityArea"),
      priority: value("priority"),
      leadSource: value("leadSource"),
      contactName: value("contactName"),
      phoneNumber: value("phoneNumber"),
      email: firstValidEmail(value("email")),
      socialUrl: value("socialUrl"),
      status: value("status"),
      packageName: value("packageName"),
      estimatedMonthlyFee: value("estimatedMonthlyFee"),
      adBudget: value("adBudget"),
      lastContact: value("lastContact"),
      nextFollowUp: value("nextFollowUp"),
      owner: value("owner"),
      mainGoal: value("mainGoal"),
      notes: value("notes")
    } satisfies CsvLeadInput];
  });
  if (leads.length === 0) throw new Error("The CSV does not contain any lead rows.");
  return { leads, headerRow: headerIndex + 1, skippedRows };
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function cleanCell(value?: string) {
  const cleaned = value?.trim();
  return cleaned || null;
}

function firstValidEmail(value: string | null) {
  if (!value) return null;
  const candidates = value.split(/[;,\s]+/).map((item) => item.trim()).filter(Boolean);
  return candidates.find((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) ?? null;
}
