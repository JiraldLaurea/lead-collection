import { parseLeadFilters } from "@/lib/leads";
import { exportFilename, getExportLeads, leadsToXlsx } from "@/lib/export";
import { requireApiAdmin } from "@/lib/require-auth";

export async function GET(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const url = new URL(request.url);
  const filters = parseLeadFilters(url.searchParams);
  const buffer = await leadsToXlsx(await getExportLeads(filters));
  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${exportFilename("xlsx", filters)}"`
    }
  });
}
