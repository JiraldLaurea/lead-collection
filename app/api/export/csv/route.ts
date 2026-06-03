import { parseLeadFilters } from "@/lib/leads";
import { exportFilename, getExportLeads, leadsToCsv } from "@/lib/export";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const url = new URL(request.url);
  const filters = parseLeadFilters(url.searchParams);
  const csv = leadsToCsv(await getExportLeads(filters));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFilename("csv", filters)}"`
    }
  });
}
