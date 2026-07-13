import { prisma } from "@/lib/prisma";

export const smeSearchEnabledSettingKey = "sme_search_enabled";

export async function isSmeSearchEnabled() {
  const override = process.env.SME_SEARCH_ENABLED;
  if (override === "true") return true;
  if (override === "false") return false;

  const setting = await prisma.appSetting.findUnique({
    where: { key: smeSearchEnabledSettingKey }
  });
  return setting?.value === "true";
}

export async function saveSmeSearchEnabled(enabled: boolean) {
  const value = enabled ? "true" : "false";
  await prisma.appSetting.upsert({
    where: { key: smeSearchEnabledSettingKey },
    create: { key: smeSearchEnabledSettingKey, value },
    update: { value }
  });
  return enabled;
}
