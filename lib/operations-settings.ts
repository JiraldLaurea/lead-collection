import { prisma } from "@/lib/prisma";

export const autoEmailEnabledSettingKey = "auto_email_enabled";
export const autoEmailScheduleEnabledSettingKey = "auto_email_schedule_enabled";
export const autoEmailScheduleStartSettingKey = "auto_email_schedule_start";
export const autoEmailScheduleEndSettingKey = "auto_email_schedule_end";
export const autoEmailDailyLimitSettingKey = "auto_email_daily_limit";

const defaultScheduleStart = "20:00";
const defaultScheduleEnd = "00:00";
const defaultDailyLimit = 10;
const minDailyLimit = 1;
const maxDailyLimit = 20;

export type OperationsSettings = {
  autoEmailEnabled: boolean;
  autoEmailScheduleEnabled: boolean;
  autoEmailScheduleStart: string;
  autoEmailScheduleEnd: string;
  autoEmailDailyLimit: number;
};

export async function getOperationsSettings(): Promise<OperationsSettings> {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          autoEmailEnabledSettingKey,
          autoEmailScheduleEnabledSettingKey,
          autoEmailScheduleStartSettingKey,
          autoEmailScheduleEndSettingKey,
          autoEmailDailyLimitSettingKey
        ]
      }
    }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    autoEmailEnabled: values.get(autoEmailEnabledSettingKey) === "true",
    autoEmailScheduleEnabled: values.get(autoEmailScheduleEnabledSettingKey) === "true",
    autoEmailScheduleStart: normalizeTimeValue(values.get(autoEmailScheduleStartSettingKey), defaultScheduleStart),
    autoEmailScheduleEnd: normalizeTimeValue(values.get(autoEmailScheduleEndSettingKey), defaultScheduleEnd),
    autoEmailDailyLimit: normalizeDailyLimit(values.get(autoEmailDailyLimitSettingKey))
  };
}

export async function saveOperationsSettings(input: OperationsSettings) {
  const autoEmailDailyLimit = normalizeDailyLimit(String(input.autoEmailDailyLimit));
  const autoEmailScheduleStart = normalizeTimeValue(input.autoEmailScheduleStart, defaultScheduleStart);
  const autoEmailScheduleEnd = normalizeTimeValue(input.autoEmailScheduleEnd, defaultScheduleEnd);
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: autoEmailEnabledSettingKey },
      create: { key: autoEmailEnabledSettingKey, value: input.autoEmailEnabled ? "true" : "false" },
      update: { value: input.autoEmailEnabled ? "true" : "false" }
    }),
    prisma.appSetting.upsert({
      where: { key: autoEmailScheduleEnabledSettingKey },
      create: { key: autoEmailScheduleEnabledSettingKey, value: input.autoEmailScheduleEnabled ? "true" : "false" },
      update: { value: input.autoEmailScheduleEnabled ? "true" : "false" }
    }),
    prisma.appSetting.upsert({
      where: { key: autoEmailScheduleStartSettingKey },
      create: { key: autoEmailScheduleStartSettingKey, value: autoEmailScheduleStart },
      update: { value: autoEmailScheduleStart }
    }),
    prisma.appSetting.upsert({
      where: { key: autoEmailScheduleEndSettingKey },
      create: { key: autoEmailScheduleEndSettingKey, value: autoEmailScheduleEnd },
      update: { value: autoEmailScheduleEnd }
    }),
    prisma.appSetting.upsert({
      where: { key: autoEmailDailyLimitSettingKey },
      create: { key: autoEmailDailyLimitSettingKey, value: String(autoEmailDailyLimit) },
      update: { value: String(autoEmailDailyLimit) }
    })
  ]);

  return {
    autoEmailEnabled: input.autoEmailEnabled,
    autoEmailScheduleEnabled: input.autoEmailScheduleEnabled,
    autoEmailScheduleStart,
    autoEmailScheduleEnd,
    autoEmailDailyLimit
  };
}

export function normalizeDailyLimit(value?: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultDailyLimit;
  return Math.min(maxDailyLimit, Math.max(minDailyLimit, Math.floor(parsed)));
}

export function normalizeTimeValue(value: string | null | undefined, fallback: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isWithinAutoEmailSchedule(settings: OperationsSettings, now = new Date()) {
  if (!settings.autoEmailScheduleEnabled) return true;
  const start = timeToMinutes(settings.autoEmailScheduleStart);
  const end = timeToMinutes(settings.autoEmailScheduleEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
