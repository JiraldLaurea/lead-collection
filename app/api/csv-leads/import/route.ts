export const runtime = "nodejs";

import { parseCsvLeads } from "@/lib/csv-import";
import { fail, ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";

const maxFileSize = 5 * 1024 * 1024;
const maxRows = 5000;

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return fail("E-CSV-01", "Choose a CSV file to import.", 400);
  if (!file.name.toLowerCase().endsWith(".csv")) return fail("E-CSV-02", "Only .csv files can be imported.", 400);
  if (file.size > maxFileSize) return fail("E-CSV-03", "The CSV must be 5MB or smaller.", 400);

  try {
    const parsed = parseCsvLeads(await file.text());
    if (parsed.leads.length > maxRows) return fail("E-CSV-04", `Import up to ${maxRows} leads at a time.`, 400);
    const csvImport = await prisma.csvImport.create({
      data: {
        fileName: file.name.slice(0, 255),
        leads: { create: parsed.leads }
      }
    });
    return ok({
      importId: csvImport.id,
      imported: parsed.leads.length,
      skipped: parsed.skippedRows.length,
      headerRow: parsed.headerRow
    });
  } catch (error) {
    return fail("E-CSV-05", error instanceof Error ? error.message : "Unable to import the CSV.", 400);
  }
}
