import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { getOperationsSettings, isWithinOutreachSchedule, type OperationsSettings } from "@/lib/operations-settings";
import { prisma } from "@/lib/prisma";
import { getSmsBodyTemplate } from "@/lib/sms-template";
import { sendSmeEmail, sendSmeSms } from "@/lib/sme/outreach";
import { ALL_NCR_CITIES, manilaDateKey, resolveSweepCities, runCityCategorySweep } from "@/lib/sme/scheduled-search";

/** Day-guard so the lead-collection sweep runs at most once per Manila day, not on every browser tick. */
export const autoOutreachLastSearchSettingKey = "auto_outreach_last_search";

type OutreachPhase = "idle" | "collecting" | "sending" | "done" | "blocked" | "disabled" | "error";

export type OutreachStatus = {
  running: boolean;
  phase: OutreachPhase;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  /** Distinct SME leads contacted today (any channel). Compared against the daily limit. */
  leadsContactedToday: number;
  /** The configured daily limit. */
  target: number;
  /** Whether email is also sent alongside SMS. Controls what the status UI shows. */
  emailEnabled: boolean;
  /** Per-pass counters. */
  smsSent: number;
  smsFailed: number;
  emailSent: number;
  emailFailed: number;
};

type OutreachState = {
  status: OutreachStatus;
  promise: Promise<void> | null;
};

const initialStatus: OutreachStatus = {
  running: false,
  phase: "idle",
  message: "Automatic outreach is idle.",
  startedAt: null,
  updatedAt: null,
  leadsContactedToday: 0,
  target: 0,
  emailEnabled: false,
  smsSent: 0,
  smsFailed: 0,
  emailSent: 0,
  emailFailed: 0
};

const globalForOutreach = globalThis as typeof globalThis & {
  leadCollectionOutreachState?: OutreachState;
};

export function usesHostedAutomation() {
  return process.env.APP_MODE === "hosted" || process.env.VERCEL === "1";
}

function getState() {
  if (!globalForOutreach.leadCollectionOutreachState) {
    globalForOutreach.leadCollectionOutreachState = { status: initialStatus, promise: null };
  }
  return globalForOutreach.leadCollectionOutreachState;
}

function updateStatus(patch: Partial<OutreachStatus>) {
  const state = getState();
  state.status = { ...state.status, ...patch, updatedAt: new Date().toISOString() };
}

/** Distinct SME businesses with at least one successful outreach today, across SMS and email. */
async function countLeadsContactedToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rows = await prisma.contactActivity.findMany({
    where: { businessId: { not: null }, status: "sent", occurredAt: { gte: today } },
    select: { businessId: true },
    distinct: ["businessId"]
  });
  return rows.length;
}

export async function getOutreachStatus() {
  const state = getState();
  const settings = await getOperationsSettings();
  state.status = {
    ...state.status,
    leadsContactedToday: await countLeadsContactedToday(),
    target: settings.dailyLimit,
    emailEnabled: settings.emailEnabled,
    updatedAt: new Date().toISOString()
  };
  return state.status;
}

export async function disableOutreachStatus() {
  const settings = await getOperationsSettings();
  updateStatus({
    running: false,
    phase: "disabled",
    message: "Automatic outreach is disabled.",
    leadsContactedToday: await countLeadsContactedToday(),
    target: settings.dailyLimit,
    emailEnabled: settings.emailEnabled
  });
  return getState().status;
}

/**
 * Local (self-hosted) driver. Kicked by the browser tick every 60s. Starts one outreach pass if
 * one is not already running and the gates pass; the pass drains the remaining daily budget.
 */
export async function ensureOutreachRunning(reason = "settings") {
  if (usesHostedAutomation()) {
    const settings = await getOperationsSettings();
    updateStatus({
      running: false,
      phase: settings.autoOutreachEnabled ? "idle" : "disabled",
      message: settings.autoOutreachEnabled
        ? "Hosted outreach is scheduled through the protected cron route."
        : "Automatic outreach is disabled.",
      leadsContactedToday: await countLeadsContactedToday(),
      target: settings.dailyLimit,
      emailEnabled: settings.emailEnabled
    });
    return getState().status;
  }

  const state = getState();
  if (state.promise) return state.status;

  const settings = await getOperationsSettings();
  const contacted = await countLeadsContactedToday();
  if (!settings.autoOutreachEnabled) {
    updateStatus({ running: false, phase: "disabled", message: "Automatic outreach is disabled.", leadsContactedToday: contacted, target: settings.dailyLimit, emailEnabled: settings.emailEnabled });
    return state.status;
  }
  if (!isWithinOutreachSchedule(settings)) {
    updateStatus({
      running: false,
      phase: "blocked",
      message: `Automatic outreach is scheduled from ${settings.scheduleStart} to ${settings.scheduleEnd}.`,
      leadsContactedToday: contacted,
      target: settings.dailyLimit,
      emailEnabled: settings.emailEnabled
    });
    return state.status;
  }
  if (contacted >= settings.dailyLimit) {
    updateStatus({ running: false, phase: "done", message: getDailyLimitReachedMessage(settings.scheduleEnabled), leadsContactedToday: contacted, target: settings.dailyLimit, emailEnabled: settings.emailEnabled });
    return state.status;
  }

  updateStatus({
    running: true,
    phase: "sending",
    message: `Automatic outreach started from ${reason}.`,
    startedAt: new Date().toISOString(),
    leadsContactedToday: contacted,
    target: settings.dailyLimit,
    emailEnabled: settings.emailEnabled,
    smsSent: 0,
    smsFailed: 0,
    emailSent: 0,
    emailFailed: 0
  });
  state.promise = runOutreachPass().finally(() => {
    state.promise = null;
  });
  return state.status;
}

/** Hosted (Vercel Cron) driver. Runs a single outreach pass and returns a summary. */
export async function runOutreachCycle() {
  const settings = await getOperationsSettings();
  const contacted = await countLeadsContactedToday();
  if (!settings.autoOutreachEnabled) return { processed: false, reason: "Automatic outreach is disabled." };
  if (!isWithinOutreachSchedule(settings)) return { processed: false, reason: "Outside the configured sending window." };
  if (contacted >= settings.dailyLimit) return { processed: false, reason: "Daily limit reached." };

  updateStatus({ smsSent: 0, smsFailed: 0, emailSent: 0, emailFailed: 0, emailEnabled: settings.emailEnabled });
  await runOutreachPass();
  const status = getState().status;
  return {
    processed: true,
    leadsContactedToday: status.leadsContactedToday,
    smsSent: status.smsSent,
    emailSent: status.emailSent,
    smsFailed: status.smsFailed,
    emailFailed: status.emailFailed
  };
}

/** Contacts the next batch of SME leads up to the remaining daily budget. */
async function runOutreachPass() {
  const settings = await getOperationsSettings();
  let contacted = await countLeadsContactedToday();

  if (!settings.autoOutreachEnabled) {
    updateStatus({ running: false, phase: "disabled", message: "Automatic outreach is disabled.", leadsContactedToday: contacted, target: settings.dailyLimit, emailEnabled: settings.emailEnabled });
    return;
  }
  if (!isWithinOutreachSchedule(settings)) {
    updateStatus({ running: false, phase: "blocked", message: `Automatic outreach window ended (${settings.scheduleStart} to ${settings.scheduleEnd}).`, leadsContactedToday: contacted, target: settings.dailyLimit, emailEnabled: settings.emailEnabled });
    return;
  }
  if (contacted >= settings.dailyLimit) {
    updateStatus({ running: false, phase: "done", message: getDailyLimitReachedMessage(settings.scheduleEnabled), leadsContactedToday: contacted, target: settings.dailyLimit, emailEnabled: settings.emailEnabled });
    return;
  }

  // Search-then-send: sweep the configured cities×categories once per day to collect fresh leads,
  // then contact them below. runCityCategorySweep persists every result into SmeBusinessProfile.
  await collectOutreachLeadsIfDue(settings);
  contacted = await countLeadsContactedToday();

  const remaining = settings.dailyLimit - contacted;
  const profiles = await prisma.smeBusinessProfile.findMany({
    where: {
      leadStatus: { not: "CONTACTED" },
      OR: [
        { phoneNumber: { not: null } },
        ...(settings.emailEnabled ? [{ email: { not: null } }] : [])
      ],
      // Never re-contact a lead that already has a successful outreach recorded.
      activities: { none: { type: { in: ["SMS", "EMAIL"] }, status: "sent" } }
    },
    select: { id: true, displayName: true, phoneNumber: true, email: true },
    orderBy: { collectedAt: "desc" },
    take: remaining
  });

  if (profiles.length === 0) {
    updateStatus({ running: false, phase: "done", message: "No more contactable SME leads to reach right now.", leadsContactedToday: contacted, target: settings.dailyLimit, emailEnabled: settings.emailEnabled });
    return;
  }

  const smsBody = await getSmsBodyTemplate();
  const emailBody = settings.emailEnabled ? await getEmailBodyTemplate() : "";

  for (const profile of profiles) {
    contacted = await countLeadsContactedToday();
    if (contacted >= settings.dailyLimit) break;

    updateStatus({ phase: "sending", message: `Contacting ${profile.displayName}.`, leadsContactedToday: contacted });

    if (profile.phoneNumber) {
      const smsOutcome = await sendSmeSms([profile.id], smsBody);
      const state = getState().status;
      updateStatus({ smsSent: state.smsSent + smsOutcome.sent, smsFailed: state.smsFailed + smsOutcome.failed });
    }
    if (settings.emailEnabled && profile.email) {
      const emailOutcome = await sendSmeEmail([profile.id], emailSubjectTemplate, emailBody);
      const state = getState().status;
      updateStatus({ emailSent: state.emailSent + emailOutcome.sent, emailFailed: state.emailFailed + emailOutcome.failed });
    }

    updateStatus({ leadsContactedToday: await countLeadsContactedToday() });
  }

  const finalContacted = await countLeadsContactedToday();
  updateStatus({
    running: false,
    phase: "done",
    message: finalContacted >= settings.dailyLimit
      ? getDailyLimitReachedMessage(settings.scheduleEnabled)
      : `Outreach pass complete. Contacted ${finalContacted} of ${settings.dailyLimit} today.`,
    leadsContactedToday: finalContacted,
    target: settings.dailyLimit,
    emailEnabled: settings.emailEnabled
  });
}

/**
 * Runs the city×category sweep at most once per Manila day. The day is marked even if the sweep
 * throws, so a failing Google provider cannot re-trigger a heavy sweep on every 60s browser tick.
 */
async function collectOutreachLeadsIfDue(settings: OperationsSettings) {
  const cities = resolveSweepCities(settings.outreachCity);
  if (cities.length === 0 || settings.outreachCategories.length === 0) return;

  const today = manilaDateKey();
  const last = await prisma.appSetting.findUnique({ where: { key: autoOutreachLastSearchSettingKey } });
  if (last?.value === today) return;

  updateStatus({
    phase: "collecting",
    message: `Collecting leads across ${settings.outreachCity === ALL_NCR_CITIES ? "all NCR cities" : settings.outreachCity}.`
  });
  try {
    await runCityCategorySweep({
      cities,
      categories: settings.outreachCategories,
      maxPerCategory: settings.outreachMaxPerCategory
    });
  } catch {
    // A discovery failure must not abort the send step; contact whatever leads already exist.
  } finally {
    await prisma.appSetting.upsert({
      where: { key: autoOutreachLastSearchSettingKey },
      create: { key: autoOutreachLastSearchSettingKey, value: today },
      update: { value: today }
    });
  }
}

function getDailyLimitReachedMessage(scheduleEnabled: boolean) {
  return scheduleEnabled
    ? "Daily outreach limit reached. Automatic outreach is paused until the next scheduled window."
    : "Daily outreach limit reached.";
}
