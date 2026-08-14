/** Client-safe CSV reader for recipient imports. Supports standard quoted CSV fields. */
export function importCsvRecipientColumn(csv: string, acceptedColumns: string[]) {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { values: [], error: "The CSV has no recipient rows." };

  const normalizedColumns = acceptedColumns.map(normalizeColumnName);
  const header = rows[0].map(normalizeColumnName);
  const index = header.findIndex((column) => normalizedColumns.includes(column));
  if (index < 0) {
    return { values: [], error: `CSV must include one of these columns: ${acceptedColumns.join(", ")}.` };
  }

  const values = Array.from(
    new Set(rows.slice(1).map((row) => row[index]?.trim()).filter((value): value is string => Boolean(value)))
  );
  return values.length ? { values, error: null } : { values: [], error: "No recipient values were found in that CSV column." };
}

export type ImportedRecipient = { value: string; name?: string };

/**
 * Imports a recipient column and, when present, the business-name column beside it. This is
 * deliberately separate from the email import: the SMS composer accepts `name, phone` lines
 * and can therefore retain the business name for log entries and personalization.
 */
export function importCsvRecipientsWithNames(
  csv: string,
  acceptedRecipientColumns: string[],
  acceptedNameColumns = ["business_name", "business name", "businessname", "display_name", "display name", "company_name", "company name", "company", "name"]
) {
  const rows = parseCsv(csv);
  if (rows.length < 2) return { recipients: [] as ImportedRecipient[], error: "The CSV has no recipient rows." };

  const header = rows[0].map(normalizeColumnName);
  const recipientIndex = header.findIndex((column) => acceptedRecipientColumns.map(normalizeColumnName).includes(column));
  if (recipientIndex < 0) {
    return { recipients: [] as ImportedRecipient[], error: `CSV must include one of these columns: ${acceptedRecipientColumns.join(", ")}.` };
  }
  const nameIndex = header.findIndex((column) => acceptedNameColumns.map(normalizeColumnName).includes(column));
  const recipientsByValue = new Map<string, ImportedRecipient>();

  for (const row of rows.slice(1)) {
    const value = row[recipientIndex]?.trim();
    if (!value) continue;
    const name = nameIndex >= 0 ? row[nameIndex]?.trim() : undefined;
    // Later rows may contain a name where an earlier duplicate did not.
    recipientsByValue.set(value, name ? { value, name } : { value });
  }

  const recipients = Array.from(recipientsByValue.values());
  return recipients.length
    ? { recipients, error: null }
    : { recipients: [] as ImportedRecipient[], error: "No recipient values were found in that CSV column." };
}

function normalizeColumnName(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && value[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((item) => item.length > 0)) rows.push(row);
  return rows;
}
