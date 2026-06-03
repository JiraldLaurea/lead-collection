import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";
import { runPlacesSearch } from "@/lib/places";

const schema = z.object({
  country: z.string().min(1).default("Philippines"),
  cityArea: z.string().min(1),
  keyword: z.string().optional(),
  searchType: z.enum(["TEXT_SEARCH", "NEARBY_SEARCH"]),
  includedType: z.string().optional(),
  radius: z.number().int().min(100).max(50000).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  maxResults: z.number().int().min(1).max(60)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("E-LEADS-02", "Invalid search input", 400, parsed.error.flatten());
  if (parsed.data.searchType === "TEXT_SEARCH" && !parsed.data.keyword?.trim()) {
    return fail("E-LEADS-02", "Keyword is required for Text Search", 400);
  }
  try {
    const job = await runPlacesSearch(parsed.data);
    return ok(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    if (message === "E-SEARCH-01") return fail("E-SEARCH-01", "Google API key is not configured", 500);
    if (message === "E-SEARCH-03") return fail("E-SEARCH-03", "Max results must be between 1 and 60", 400);
    return fail("E-SEARCH-02", "Google Places search failed. Please check the logs.", 502);
  }
}
