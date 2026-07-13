import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireApiAdmin } from "@/lib/require-auth";
import { saveSmsBodyTemplate } from "@/lib/sms-template";

// 1000 matches the limit the existing send-SMS routes enforce on a message body, so a
// template can never be saved that those routes would then reject.
const schema = z.object({
  body: z.string().trim().min(1).max(1000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return fail("E-SETTINGS-02", "Invalid SMS template", 400, parsed.error.flatten());
  }

  const setting = await saveSmsBodyTemplate(parsed.data.body);
  return ok({ body: setting.value });
}
