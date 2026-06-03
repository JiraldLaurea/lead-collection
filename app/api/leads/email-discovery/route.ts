import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { discoverLeadEmail } from "@/lib/email-discovery";
import { requireApiAdmin } from "@/lib/require-auth";

const schema = z.object({
  leadIds: z.array(z.number().int().positive()).min(1).max(50)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("E-LEADS-02", "Invalid lead selection", 400, parsed.error.flatten());

  const results = [];
  for (const leadId of parsed.data.leadIds) {
    results.push({ leadId, ...(await discoverLeadEmail(leadId)) });
  }

  return ok({
    totalChecked: results.length,
    totalFound: results.filter((result) => result.status === "FOUND").length,
    results
  });
}
