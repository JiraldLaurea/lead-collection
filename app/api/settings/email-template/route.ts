import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { saveEmailBodyTemplate } from "@/lib/email-template";
import { requireApiAdmin } from "@/lib/require-auth";

const schema = z.object({
  body: z.string().trim().min(1).max(5000)
});

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return fail("E-SETTINGS-01", "Invalid email template", 400, parsed.error.flatten());

  const setting = await saveEmailBodyTemplate(parsed.data.body);
  return ok({ body: setting.value });
}
