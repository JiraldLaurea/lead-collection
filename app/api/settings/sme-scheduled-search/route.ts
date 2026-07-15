import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";
import { saveScheduledSmeSearchSettings } from "@/lib/sme/scheduled-search";

const schema = z.object({
  enabled: z.boolean(),
  locationMode: z.enum(["STREET", "CITY"]),
  zoneId: z.number().int().positive().nullable(),
  city: z.string().trim().max(100),
  category: z.string().trim().max(60),
  categories: z.array(z.string().trim().max(60)).max(20),
  maxResults: z.number().int().min(1).max(60),
  maxPerCategory: z.number().int().min(1).max(60),
  radiusMeters: z.number().int().min(50).max(50000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-SCHEDULE-02", "Invalid scheduled SME search settings.", 400);

  try {
    return ok(await saveScheduledSmeSearchSettings(parsed.data));
  } catch (error) {
    return fail("E-SME-SCHEDULE-03", error instanceof Error ? error.message : "Unable to save scheduled search settings.", 400);
  }
}
