import { z } from "zod";
import { fail, ok } from "@/lib/http";
import {
  getEmailTemplateAttachmentMetadata,
  removeEmailTemplateAttachment,
  saveEmailBodyTemplate,
  saveEmailTemplateAttachment
} from "@/lib/email-template";
import { requireApiAdmin } from "@/lib/require-auth";

const schema = z.object({
  body: z.string().trim().min(1).max(5000)
});
const maxDefaultAttachmentSize = 10 * 1024 * 1024;

async function parseTemplateRequest(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const parsed = schema.safeParse(await request.json());
    return { parsed, attachment: null, removeAttachment: false };
  }

  const formData = await request.formData();
  const attachment = formData.get("defaultAttachment");
  if (attachment instanceof File && attachment.size > maxDefaultAttachmentSize) {
    throw new Error("Default attachment is larger than 10MB.");
  }

  return {
    parsed: schema.safeParse({ body: formData.get("body") }),
    attachment: attachment instanceof File && attachment.size > 0 ? attachment : null,
    removeAttachment: formData.get("removeDefaultAttachment") === "true"
  };
}

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  let templateRequest: Awaited<ReturnType<typeof parseTemplateRequest>>;
  try {
    templateRequest = await parseTemplateRequest(request);
  } catch (error) {
    return fail("E-SETTINGS-03", error instanceof Error ? error.message : "Invalid default attachment", 400);
  }

  if (!templateRequest.parsed.success) return fail("E-SETTINGS-01", "Invalid email template", 400, templateRequest.parsed.error.flatten());

  const setting = await saveEmailBodyTemplate(templateRequest.parsed.data.body);
  if (templateRequest.removeAttachment) {
    await removeEmailTemplateAttachment();
  }
  const attachmentMetadata = templateRequest.attachment
    ? await saveEmailTemplateAttachment(templateRequest.attachment)
    : await getEmailTemplateAttachmentMetadata();

  return ok({ body: setting.value, attachment: attachmentMetadata });
}
