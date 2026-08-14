import { prisma } from "@/lib/prisma";

/**
 * Hard daily cap on paid Google Place Details calls.
 *
 * Place Details (Enterprise) is the most expensive Places SKU, and a single accidental
 * loop of full "All NCR × categories" sweeps once cost ~$400 in one day. This budget is a
 * process-side ceiling so no sequence of searches — manual, scheduled, or outreach — can run
 * up an unbounded bill even before the Google Cloud quota limit is reached.
 */

const placesDetailsUsageKey = "places_details_calls_today";
const DEFAULT_DAILY_CAP = 3000;

export function placesDetailsDailyCap() {
  const value = Number(process.env.PLACES_DETAILS_DAILY_CAP);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_DAILY_CAP;
}

/** Manila-day key (YYYY-MM-DD). Inlined to keep this module free of import cycles. */
function manilaDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function readUsage(): Promise<{ date: string; count: number }> {
  const today = manilaDateKey();
  const row = await prisma.appSetting.findUnique({ where: { key: placesDetailsUsageKey } });
  if (!row?.value) return { date: today, count: 0 };
  try {
    const parsed = JSON.parse(row.value) as { date?: string; count?: number };
    // A stored count from an earlier day is stale — the budget resets each Manila day.
    if (parsed.date === today && Number.isFinite(parsed.count)) return { date: today, count: Math.max(0, parsed.count!) };
  } catch {
    // Fall through to a fresh count.
  }
  return { date: today, count: 0 };
}

/** Place Details calls still allowed today (0 when the daily cap is reached). */
export async function getRemainingPlacesDetailsBudget(): Promise<number> {
  const { count } = await readUsage();
  return Math.max(0, placesDetailsDailyCap() - count);
}

/** Records that `calls` real Place Details calls were made, resetting on a new Manila day. */
export async function recordPlacesDetailsCalls(calls: number): Promise<void> {
  if (calls <= 0) return;
  const { count } = await readUsage();
  const value = JSON.stringify({ date: manilaDateKey(), count: count + calls });
  await prisma.appSetting.upsert({
    where: { key: placesDetailsUsageKey },
    create: { key: placesDetailsUsageKey, value },
    update: { value }
  });
}

export async function getPlacesDetailsUsageToday() {
  const { count } = await readUsage();
  return { count, cap: placesDetailsDailyCap() };
}
