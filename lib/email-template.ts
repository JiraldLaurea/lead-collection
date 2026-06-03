import { prisma } from "@/lib/prisma";
import { defaultEmailBodyTemplate } from "@/lib/email-template-defaults";

const emailBodySettingKey = "email_template_body";

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
