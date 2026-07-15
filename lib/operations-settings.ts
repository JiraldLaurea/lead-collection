import { metroManilaCities } from "@/lib/philippines-locations";
import { prisma } from "@/lib/prisma";
import { smeCategoryKeys } from "@/lib/sme/categories";
import { ALL_NCR_CITIES } from "@/lib/sme/scheduled-search";

export const autoOutreachEnabledSettingKey = "auto_outreach_enabled";
export const autoOutreachEmailEnabledSettingKey = "auto_outreach_email_enabled";
export const autoOutreachScheduleEnabledSettingKey = "auto_outreach_schedule_enabled";
export const autoOutreachScheduleStartSettingKey = "auto_outreach_schedule_start";
export const autoOutreachScheduleEndSettingKey = "auto_outreach_schedule_end";
export const autoOutreachDailyLimitSettingKey = "auto_outreach_daily_limit";
export const autoOutreachCitySettingKey = "auto_outreach_city";
export const autoOutreachCategoriesSettingKey = "auto_outreach_categories";
export const autoOutreachMaxPerCategorySettingKey = "auto_outreach_max_per_category";

const defaultScheduleStart = "20:00";
const defaultScheduleEnd = "00:00";
const defaultDailyLimit = 10;
const minDailyLimit = 1;
const maxDailyLimit = 20;
const defaultMaxPerCategory = 30;

export type OperationsSettings = {
  /** Master toggle: automatically send SMS to contactable SME leads. */
  autoOutreachEnabled: boolean;
  /** Also send email to SME leads that have an email address. */
  emailEnabled: boolean;
  scheduleEnabled: boolean;
  scheduleStart: string;
  scheduleEnd: string;
  /** Maximum SME leads contacted per day. A lead that gets both an SMS and an email counts once. */
  dailyLimit: number;
  /** Search scope used to collect leads before sending: NCR city or ALL_NCR_CITIES. Empty skips collection. */
  outreachCity: string;
  /** Categories swept when collecting leads (defaults to every SME category). */
  outreachCategories: string[];
  /** Maximum qualified leads collected per category per city, per daily sweep. */
  outreachMaxPerCategory: number;
};

export async function getOperationsSettings(): Promise<OperationsSettings> {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          autoOutreachEnabledSettingKey,
          autoOutreachEmailEnabledSettingKey,
          autoOutreachScheduleEnabledSettingKey,
          autoOutreachScheduleStartSettingKey,
          autoOutreachScheduleEndSettingKey,
          autoOutreachDailyLimitSettingKey,
          autoOutreachCitySettingKey,
          autoOutreachCategoriesSettingKey,
          autoOutreachMaxPerCategorySettingKey
        ]
      }
    }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    autoOutreachEnabled: values.get(autoOutreachEnabledSettingKey) === "true",
    emailEnabled: values.get(autoOutreachEmailEnabledSettingKey) === "true",
    scheduleEnabled: values.get(autoOutreachScheduleEnabledSettingKey) === "true",
    scheduleStart: normalizeTimeValue(values.get(autoOutreachScheduleStartSettingKey), defaultScheduleStart),
    scheduleEnd: normalizeTimeValue(values.get(autoOutreachScheduleEndSettingKey), defaultScheduleEnd),
    dailyLimit: normalizeDailyLimit(values.get(autoOutreachDailyLimitSettingKey)),
    outreachCity: normalizeOutreachCity(values.get(autoOutreachCitySettingKey)),
    outreachCategories: normalizeOutreachCategories(values.get(autoOutreachCategoriesSettingKey)),
    outreachMaxPerCategory: normalizeMaxPerCategory(values.get(autoOutreachMaxPerCategorySettingKey))
  };
}

export async function saveOperationsSettings(input: OperationsSettings) {
  const dailyLimit = normalizeDailyLimit(String(input.dailyLimit));
  const scheduleStart = normalizeTimeValue(input.scheduleStart, defaultScheduleStart);
  const scheduleEnd = normalizeTimeValue(input.scheduleEnd, defaultScheduleEnd);
  const outreachCity = normalizeOutreachCity(input.outreachCity);
  const outreachCategories = normalizeOutreachCategories(input.outreachCategories);
  const outreachMaxPerCategory = normalizeMaxPerCategory(String(input.outreachMaxPerCategory));
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: autoOutreachEnabledSettingKey },
      create: { key: autoOutreachEnabledSettingKey, value: input.autoOutreachEnabled ? "true" : "false" },
      update: { value: input.autoOutreachEnabled ? "true" : "false" }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachEmailEnabledSettingKey },
      create: { key: autoOutreachEmailEnabledSettingKey, value: input.emailEnabled ? "true" : "false" },
      update: { value: input.emailEnabled ? "true" : "false" }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachScheduleEnabledSettingKey },
      create: { key: autoOutreachScheduleEnabledSettingKey, value: input.scheduleEnabled ? "true" : "false" },
      update: { value: input.scheduleEnabled ? "true" : "false" }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachScheduleStartSettingKey },
      create: { key: autoOutreachScheduleStartSettingKey, value: scheduleStart },
      update: { value: scheduleStart }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachScheduleEndSettingKey },
      create: { key: autoOutreachScheduleEndSettingKey, value: scheduleEnd },
      update: { value: scheduleEnd }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachDailyLimitSettingKey },
      create: { key: autoOutreachDailyLimitSettingKey, value: String(dailyLimit) },
      update: { value: String(dailyLimit) }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachCitySettingKey },
      create: { key: autoOutreachCitySettingKey, value: outreachCity },
      update: { value: outreachCity }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachCategoriesSettingKey },
      create: { key: autoOutreachCategoriesSettingKey, value: JSON.stringify(outreachCategories) },
      update: { value: JSON.stringify(outreachCategories) }
    }),
    prisma.appSetting.upsert({
      where: { key: autoOutreachMaxPerCategorySettingKey },
      create: { key: autoOutreachMaxPerCategorySettingKey, value: String(outreachMaxPerCategory) },
      update: { value: String(outreachMaxPerCategory) }
    })
  ]);

  return {
    autoOutreachEnabled: input.autoOutreachEnabled,
    emailEnabled: input.emailEnabled,
    scheduleEnabled: input.scheduleEnabled,
    scheduleStart,
    scheduleEnd,
    dailyLimit,
    outreachCity,
    outreachCategories,
    outreachMaxPerCategory
  };
}

export function normalizeDailyLimit(value?: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultDailyLimit;
  return Math.min(maxDailyLimit, Math.max(minDailyLimit, Math.floor(parsed)));
}

export function normalizeOutreachCity(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  if (trimmed === ALL_NCR_CITIES) return ALL_NCR_CITIES;
  return metroManilaCities.includes(trimmed) ? trimmed : "";
}

export function normalizeOutreachCategories(value?: string | string[] | null) {
  let list: string[] = [];
  if (Array.isArray(value)) {
    list = value;
  } else if (typeof value === "string" && value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
  }
  const valid = list.filter((key): key is string => typeof key === "string" && smeCategoryKeys.includes(key));
  const unique = Array.from(new Set(valid));
  return unique.length > 0 ? unique : [...smeCategoryKeys];
}

export function normalizeMaxPerCategory(value?: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultMaxPerCategory;
  return Math.min(60, Math.max(1, Math.floor(parsed)));
}

export function normalizeTimeValue(value: string | null | undefined, fallback: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  const [hour, minute] = value.split(":").map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isWithinOutreachSchedule(settings: OperationsSettings, now = new Date()) {
  if (!settings.scheduleEnabled) return true;
  const start = timeToMinutes(settings.scheduleStart);
  const end = timeToMinutes(settings.scheduleEnd);
  const current = now.getHours() * 60 + now.getMinutes();
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}
