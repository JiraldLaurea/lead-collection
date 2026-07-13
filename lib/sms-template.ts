import { prisma } from "@/lib/prisma";
import { defaultSmsBodyTemplate } from "@/lib/sms-template-defaults";

const smsBodySettingKey = "sms_template_body";

export async function getSmsBodyTemplate() {
  const setting = await prisma.appSetting.findUnique({ where: { key: smsBodySettingKey } });
  return setting?.value || defaultSmsBodyTemplate;
}

export async function saveSmsBodyTemplate(value: string) {
  return prisma.appSetting.upsert({
    where: { key: smsBodySettingKey },
    create: { key: smsBodySettingKey, value },
    update: { value }
  });
}
