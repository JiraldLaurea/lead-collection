export const runtime = "nodejs";

import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { saveSmeLeads } from "@/lib/sme/save-leads";
import type { SmeSearchResult } from "@/lib/sme/run-search";

const reasonSchema = z.object({ code: z.string(), detail: z.string() });

const resultSchema = z.object({
  providerPlaceId: z.string().min(1),
  displayName: z.string().min(1),
  primaryType: z.string().nullable(),
  formattedAddress: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  phoneNumber: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  websiteHost: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number().nullable(),
  businessStatus: z.string().nullable(),
  googleMapsUri: z.string().nullable(),
  classification: z.object({
    autoClass: z.string(),
    effectiveClass: z.string(),
    confidence: z.number(),
    reasons: z.array(reasonSchema),
    branchCount: z.number(),
    matchedBrandId: z.number().nullable(),
    matchedBrandName: z.string().nullable()
  }),
  savedLeadId: z.number().nullable(),
  alreadyContacted: z.boolean(),
  doNotContact: z.boolean()
});

const schema = z.object({
  searchRunId: z.number().int().positive().optional(),
  results: z.array(resultSchema).min(1).max(60)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("E-SME-03", "Invalid save request", 400, parsed.error.flatten());
  }

  try {
    const result = await saveSmeLeads(parsed.data.results as SmeSearchResult[], {
      searchRunId: parsed.data.searchRunId
    });
    return ok(result);
  } catch {
    return fail("E-SME-04", "Unable to save the selected businesses.", 500);
  }
}
