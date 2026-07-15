export const runtime = "nodejs";

import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin, requireSmeSearchApi } from "@/lib/require-auth";
import { sendSmeEmail } from "@/lib/sme/outreach";

const schema = z.object({
  businessIds: z.array(z.number().int().positive()).min(1).max(200),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(5000)
});

/** Sends email from captured SME profiles, using the same mailer, templates, DNC screening and Email Log as legacy leads. */
export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;
  const flagError = await requireSmeSearchApi();
  if (flagError) return flagError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("E-SME-EMAIL-03", "Invalid email request", 400, parsed.error.flatten());

  const outcome = await sendSmeEmail(parsed.data.businessIds, parsed.data.subject, parsed.data.body);
  if (outcome.sendableCount === 0) {
    return fail("E-SME-EMAIL-04", "No selected businesses have a contactable email address", 400, {
      screening: outcome.screening,
      excluded: outcome.excluded
    });
  }
  if (outcome.sent === 0) return fail("E-SME-EMAIL-05", "Email sending failed", 500, outcome.results);

  return ok({
    sent: outcome.sent,
    failed: outcome.failed,
    results: outcome.results,
    screening: outcome.screening,
    excluded: outcome.excluded
  });
}
