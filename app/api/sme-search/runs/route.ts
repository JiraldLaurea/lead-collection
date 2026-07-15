export const runtime = "nodejs";

import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { PlacesError } from "@/lib/sme/google-places";
import { checkSearchRateLimit } from "@/lib/sme/rate-limit";
import { runSmeSearch } from "@/lib/sme/run-search";

const schema = z.object({
  mode: z.enum(["COMMERCIAL_ROAD", "CITY_CATEGORY", "MAP_RADIUS", "FREE_TEXT"]),
  city: z.string().trim().max(100).optional(),
  commercialArea: z.string().trim().max(100).optional(),
  roadName: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  keyword: z.string().trim().max(200).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  radiusMeters: z.number().int().min(50).max(50000).optional(),
  zonePriority: z.enum(["A+", "A", "B+", "B", "C"]).optional(),
  // Capped deliberately: every result costs a Places request at the details stage.
  maxResults: z.number().int().min(1).max(60).optional(),
  filters: z
    .object({
      minRating: z.number().min(0).max(5).optional(),
      minReviewCount: z.number().int().min(0).optional(),
      maxReviewCount: z.number().int().min(0).optional(),
      hasPhone: z.boolean().optional(),
      hasWebsite: z.boolean().optional(),
      businessStatus: z.enum(["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"]).optional(),
      classification: z.enum([
        "INDEPENDENT_SME",
        "LOCAL_SME_CHAIN",
        "MANUAL_REVIEW",
        "LARGE_CHAIN",
        "FRANCHISE_EXCLUDED",
        "MANUAL_INCLUDE",
        "MANUAL_EXCLUDE"
      ]).optional(),
      franchiseStatus: z.enum(["INCLUDED", "EXCLUDED"]).optional(),
      leadStatus: z.enum(["NEW", "QUALIFIED", "READY_TO_CONTACT", "CONTACTED", "REPLIED", "MEETING", "PROPOSAL_SENT", "NEGOTIATING", "WON", "LOST", "NURTURE", "DO_NOT_CONTACT"]).optional(),
      excludeDoNotContact: z.boolean().optional(),
      excludePreviouslyContacted: z.boolean().optional()
    })
    .optional()
});

const errorStatus: Record<string, number> = {
  "E-PLACES-01": 500,
  "E-PLACES-02": 502,
  "E-PLACES-03": 429,
  "E-PLACES-04": 502,
  "E-PLACES-05": 400,
  "E-PLACES-06": 504
};

const errorMessage: Record<string, string> = {
  "E-PLACES-01": "Google Maps API key is not configured.",
  "E-PLACES-02": "Google Places request failed. Please try again.",
  "E-PLACES-03": "Google Places quota reached. Try again shortly.",
  "E-PLACES-04": "Google rejected the request. Check that Places API (New) is enabled and the key is unrestricted for it.",
  "E-PLACES-05": "The search request was not valid.",
  "E-PLACES-06": "The Google Places request timed out."
};

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  // Checked before the body is even parsed: every search spends real money at Google.
  const rateLimit = checkSearchRateLimit();
  if (!rateLimit.allowed) {
    return fail(
      "E-SME-09",
      `Too many searches. Try again in ${rateLimit.retryAfterSeconds} second${rateLimit.retryAfterSeconds === 1 ? "" : "s"}.`,
      429
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("E-SME-01", "Invalid search request", 400, parsed.error.flatten());
  }

  const { filters, ...searchRequest } = parsed.data;

  try {
    const result = await runSmeSearch(searchRequest, filters ?? {}, { signal: request.signal });
    return ok(result);
  } catch (error) {
    if (error instanceof PlacesError) {
      return fail(error.code, errorMessage[error.code] ?? "Google Places request failed", errorStatus[error.code] ?? 502);
    }
    return fail("E-SME-02", "SME search failed. Please check the logs.", 500);
  }
}
