import { disableOutreachStatus, ensureOutreachRunning, usesHostedAutomation } from "@/lib/auto-outreach";
import { fail, ok } from "@/lib/http";
import {
  normalizeDailyLimit,
  normalizeMaxPerCategory,
  normalizeOutreachCategories,
  normalizeOutreachCity,
  normalizeTimeValue,
  saveOperationsSettings
} from "@/lib/operations-settings";
import { requireApiAdmin } from "@/lib/require-auth";

export async function POST(request: Request) {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  const body = await request.json().catch(() => null) as {
    autoOutreachEnabled?: boolean;
    emailEnabled?: boolean;
    scheduleEnabled?: boolean;
    scheduleStart?: string;
    scheduleEnd?: string;
    dailyLimit?: number;
    outreachCity?: string;
    outreachCategories?: string[];
    outreachMaxPerCategory?: number;
  } | null;
  if (!body) return fail("E-SETTINGS-02", "Invalid operations settings request", 400);

  const settings = await saveOperationsSettings({
    autoOutreachEnabled: body.autoOutreachEnabled === true,
    emailEnabled: body.emailEnabled === true,
    scheduleEnabled: body.scheduleEnabled === true,
    scheduleStart: normalizeTimeValue(body.scheduleStart, "20:00"),
    scheduleEnd: normalizeTimeValue(body.scheduleEnd, "00:00"),
    dailyLimit: normalizeDailyLimit(String(body.dailyLimit ?? "")),
    outreachCity: normalizeOutreachCity(body.outreachCity),
    outreachCategories: normalizeOutreachCategories(body.outreachCategories),
    outreachMaxPerCategory: normalizeMaxPerCategory(String(body.outreachMaxPerCategory ?? ""))
  });

  if (settings.autoOutreachEnabled && !usesHostedAutomation()) {
    await ensureOutreachRunning("settings save");
  } else {
    await disableOutreachStatus();
  }

  return ok(settings);
}
