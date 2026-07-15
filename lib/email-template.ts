import { prisma } from "@/lib/prisma";
import { defaultEmailBodyTemplate } from "@/lib/email-template-defaults";
import { del, get, put } from "@vercel/blob";
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
  storage?: "blob" | "local";
  blobUrl?: string;
};

function useBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL === "1");
}

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
  const existing = await getEmailTemplateAttachmentMetadata();
  if (useBlobStorage()) {
    if (existing?.storage === "blob" && existing.blobUrl) {
      await del(existing.blobUrl).catch(() => undefined);
    }
    const blob = await put(`email-template/default/${file.name}`, Buffer.from(await file.arrayBuffer()), {
      access: "private",
      addRandomSuffix: true,
      contentType: file.type || undefined
    });
    const metadata: EmailTemplateAttachmentMetadata = {
      filename: file.name,
      contentType: file.type || undefined,
      size: file.size,
      updatedAt: new Date().toISOString(),
      storage: "blob",
      blobUrl: blob.url
    };
    await prisma.appSetting.upsert({
      where: { key: defaultAttachmentSettingKey },
      create: { key: defaultAttachmentSettingKey, value: JSON.stringify(metadata) },
      update: { value: JSON.stringify(metadata) }
    });
    return metadata;
  }

  await fs.mkdir(path.dirname(defaultAttachmentPath), { recursive: true });
  await fs.writeFile(defaultAttachmentPath, Buffer.from(await file.arrayBuffer()));
  const metadata: EmailTemplateAttachmentMetadata = {
    filename: path.basename(file.name),
    contentType: file.type || undefined,
    size: file.size,
    updatedAt: new Date().toISOString(),
    storage: "local"
  };
  await prisma.appSetting.upsert({
    where: { key: defaultAttachmentSettingKey },
    create: { key: defaultAttachmentSettingKey, value: JSON.stringify(metadata) },
    update: { value: JSON.stringify(metadata) }
  });
  return metadata;
}

export async function removeEmailTemplateAttachment() {
  const metadata = await getEmailTemplateAttachmentMetadata();
  if (metadata?.storage === "blob" && metadata.blobUrl) {
    await del(metadata.blobUrl).catch(() => undefined);
  }
  await fs.rm(defaultAttachmentPath, { force: true }).catch(() => undefined);
  await prisma.appSetting.delete({ where: { key: defaultAttachmentSettingKey } }).catch(() => undefined);
}

export async function getEmailTemplateDefaultAttachment() {
  const metadata = await getEmailTemplateAttachmentMetadata();
  if (!metadata) return null;
  try {
    if (metadata.storage === "blob" && metadata.blobUrl) {
      const result = await get(metadata.blobUrl, { access: "private" });
      if (!result?.stream) return null;
      return {
        filename: metadata.filename,
        content: Buffer.from(await new Response(result.stream).arrayBuffer()),
        contentType: metadata.contentType
      };
    }
    return {
      filename: metadata.filename,
      content: await fs.readFile(defaultAttachmentPath),
      contentType: metadata.contentType
    };
  } catch {
    return null;
  }
}
