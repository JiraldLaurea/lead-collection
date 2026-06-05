import { prisma } from "@/lib/prisma";

export const autoEmailEnabledSettingKey = "auto_email_enabled";
export const autoEmailDailyLimitSettingKey = "auto_email_daily_limit";

const defaultDailyLimit = 10;
const minDailyLimit = 1;
const maxDailyLimit = 20;

export type OperationsSettings = {
  autoEmailEnabled: boolean;
  autoEmailDailyLimit: number;
};

export async function getOperationsSettings(): Promise<OperationsSettings> {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [autoEmailEnabledSettingKey, autoEmailDailyLimitSettingKey]
      }
    }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    autoEmailEnabled: values.get(autoEmailEnabledSettingKey) === "true",
    autoEmailDailyLimit: normalizeDailyLimit(values.get(autoEmailDailyLimitSettingKey))
  };
}

export async function saveOperationsSettings(input: OperationsSettings) {
  const autoEmailDailyLimit = normalizeDailyLimit(String(input.autoEmailDailyLimit));
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: autoEmailEnabledSettingKey },
      create: { key: autoEmailEnabledSettingKey, value: input.autoEmailEnabled ? "true" : "false" },
      update: { value: input.autoEmailEnabled ? "true" : "false" }
    }),
    prisma.appSetting.upsert({
      where: { key: autoEmailDailyLimitSettingKey },
      create: { key: autoEmailDailyLimitSettingKey, value: String(autoEmailDailyLimit) },
      update: { value: String(autoEmailDailyLimit) }
    })
  ]);

  return { autoEmailEnabled: input.autoEmailEnabled, autoEmailDailyLimit };
}

export function normalizeDailyLimit(value?: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultDailyLimit;
  return Math.min(maxDailyLimit, Math.max(minDailyLimit, Math.floor(parsed)));
}
