import { z } from "zod";
import { discoverSmeProfileEmail } from "@/lib/email-discovery";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";

const schema = z.object({ providerPlaceIds: z.array(z.string().min(1)).min(1).max(60) });

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-EMAIL-01", "Invalid SME email discovery request", 400, parsed.error.flatten());

  const results = [];
  for (const providerPlaceId of parsed.data.providerPlaceIds) {
    try {
      results.push({ providerPlaceId, ...(await discoverSmeProfileEmail(providerPlaceId)) });
    } catch (error) {
      results.push({ providerPlaceId, status: "ERROR", email: null, source: null, error: error instanceof Error ? error.message : "Unable to discover email" });
    }
  }
  return ok({ results, totalFound: results.filter((result) => result.status === "FOUND").length });
}
