import { fail } from "@/lib/http";
import { parseLeadFilters } from "@/lib/leads";
import { getExportLeadsByIds, leadsToPhoneCsv, phoneExportFilename } from "@/lib/export";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const url = new URL(request.url);
  const filters = parseLeadFilters(url.searchParams);
  const ids = parseIds(url.searchParams.get("ids"));
  if (ids.length === 0) return fail("E-EXPORT-01", "Select at least one lead to export phone numbers.", 400);
  const csv = leadsToPhoneCsv(await getExportLeadsByIds(ids));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${phoneExportFilename(filters)}"`
    }
  });
}

function parseIds(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item > 0);
}
