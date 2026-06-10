import { prisma } from "@/lib/prisma";
import { defaultEmailBodyTemplate } from "@/lib/email-template-defaults";
import fs from "node:fs/promises";
import path from "node:path";

const emailBodySettingKey = "email_template_body";
const defaultAttachmentSettingKey = "email_template_default_attachment";
const defaultAttachmentPath = path.join(process.cwd(), "data", "email-template-default-attachment.bin");

export type EmailTemplateAttachmentMetadata = {
  filename: string;
  contentType?: string;
  size: number;
  updatedAt: string;
};

export async function getEmailBodyTemplate() {
  const setting = await prisma.appSetting.findUnique({ where: { key: emailBodySettingKey } });
  return setting?.value || defaultEmailBodyTemplate;
}

export async function saveEmailBodyTemplate(value: string) {
  return prisma.appSetting.upsert({
    where: { key: emailBodySettingKey },
    create: { key: emailBodySettingKey, value },
    update: { value }
  });
}

export async function getEmailTemplateAttachmentMetadata() {
  const setting = await prisma.appSetting.findUnique({ where: { key: defaultAttachmentSettingKey } });
  if (!setting?.value) return null;
  try {
    return JSON.parse(setting.value) as EmailTemplateAttachmentMetadata;
  } catch {
    return null;
  }
}

export async function saveEmailTemplateAttachment(file: File) {
  await fs.mkdir(path.dirname(defaultAttachmentPath), { recursive: true });
  await fs.writeFile(defaultAttachmentPath, Buffer.from(await file.arrayBuffer()));
  const metadata: EmailTemplateAttachmentMetadata = {
    filename: path.basename(file.name),
    contentType: file.type || undefined,
    size: file.size,
    updatedAt: new Date().toISOString()
  };
  await prisma.appSetting.upsert({
    where: { key: defaultAttachmentSettingKey },
    create: { key: defaultAttachmentSettingKey, value: JSON.stringify(metadata) },
    update: { value: JSON.stringify(metadata) }
  });
  return metadata;
}

export async function removeEmailTemplateAttachment() {
  await fs.rm(defaultAttachmentPath, { force: true }).catch(() => undefined);
  await prisma.appSetting.delete({ where: { key: defaultAttachmentSettingKey } }).catch(() => undefined);
}

export async function getEmailTemplateDefaultAttachment() {
  const metadata = await getEmailTemplateAttachmentMetadata();
  if (!metadata) return null;
  try {
    return {
      filename: metadata.filename,
      content: await fs.readFile(defaultAttachmentPath),
      contentType: metadata.contentType
    };
  } catch {
    return null;
  }
}
