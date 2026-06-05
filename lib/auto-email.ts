import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { discoverLeadEmail } from "@/lib/email-discovery";
import { sendLeadEmail, smtpConfigured } from "@/lib/mailer";
import { getOperationsSettings } from "@/lib/operations-settings";
import { philippinesLocations, provinces } from "@/lib/philippines-locations";
import { runPlacesSearch } from "@/lib/places";
import { prisma } from "@/lib/prisma";

const businessKeywords = [
  "restaurant",
  "cafe",
  "hotel",
  "resort",
  "dental clinic",
  "medical clinic",
  "law office",
  "accounting firm",
  "real estate agency",
  "construction company",
  "printing services",
  "auto repair shop",
  "beauty salon",
  "spa",
  "fitness gym",
  "event venue",
  "travel agency",
  "hardware store",
  "retail store",
  "marketing agency"
];

type AutomationPhase = "idle" | "searching" | "discovering" | "sending" | "done" | "blocked" | "disabled" | "error";

export type AutomationStatus = {
  running: boolean;
  phase: AutomationPhase;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  iteration: number;
  sentToday: number;
  target: number;
  searchesRun: number;
  emailsFound: number;
  emailsSent: number;
  emailFailed: number;
};

type AutomationState = {
  status: AutomationStatus;
  promise: Promise<void> | null;
};

const initialStatus: AutomationStatus = {
  running: false,
  phase: "idle",
  message: "Automation is idle.",
  startedAt: null,
  updatedAt: null,
  iteration: 0,
  sentToday: 0,
  target: 0,
  searchesRun: 0,
  emailsFound: 0,
  emailsSent: 0,
  emailFailed: 0
};

const globalForAutomation = globalThis as typeof globalThis & {
  leadCollectionAutomationState?: AutomationState;
};

function getState() {
  if (!globalForAutomation.leadCollectionAutomationState) {
    globalForAutomation.leadCollectionAutomationState = { status: initialStatus, promise: null };
  }
  return globalForAutomation.leadCollectionAutomationState;
}

export async function getAutomationStatus() {
  const state = getState();
  const settings = await getOperationsSettings();
  state.status = {
    ...state.status,
    sentToday: await countEmailsSentToday(),
    target: settings.autoEmailDailyLimit,
    updatedAt: new Date().toISOString()
  };
  return state.status;
}

export async function ensureAutomationRunning(reason = "settings") {
  const state = getState();
  if (state.promise) return state.status;

  const settings = await getOperationsSettings();
  const sentToday = await countEmailsSentToday();
  if (!settings.autoEmailEnabled) {
    updateStatus({ running: false, phase: "disabled", message: "Automatic email sending is disabled.", sentToday, target: settings.autoEmailDailyLimit });
    return state.status;
  }
  if (sentToday >= settings.autoEmailDailyLimit) {
    updateStatus({ running: false, phase: "done", message: "Daily email sending limit reached.", sentToday, target: settings.autoEmailDailyLimit });
    return state.status;
  }

  state.promise = runAutomationLoop(reason, false).finally(() => {
    state.promise = null;
  });
  return state.status;
}

export async function ensureTestAutomationRunning() {
  const state = getState();
  if (state.promise) return state.status;

  state.promise = runAutomationLoop("test automatic email sending", true).finally(() => {
    state.promise = null;
  });
  return state.status;
}

export async function disableAutomationStatus() {
  const settings = await getOperationsSettings();
  updateStatus({
    running: false,
    phase: "disabled",
    message: "Automatic email sending is disabled.",
    sentToday: await countEmailsSentToday(),
    target: settings.autoEmailDailyLimit
  });
  return getState().status;
}

async function runAutomationLoop(reason: string, testRun: boolean) {
  const startedAt = new Date().toISOString();
  updateStatus({
    running: true,
    phase: "searching",
    message: `Automation started from ${reason}.`,
    startedAt,
    iteration: 0,
    sentToday: await countEmailsSentToday(),
    target: testRun ? 1 : (await getOperationsSettings()).autoEmailDailyLimit,
    searchesRun: 0,
    emailsFound: 0,
    emailsSent: 0,
    emailFailed: 0
  });

  if (!smtpConfigured()) {
    updateStatus({
      running: false,
      phase: "blocked",
      message: "SMTP is not configured, so automatic sending cannot continue."
    });
    return;
  }

  let noProgressCycles = 0;
  const maxCycles = testRun ? 1 : 80;
  for (let iteration = 1; iteration <= maxCycles; iteration += 1) {
    const settings = await getOperationsSettings();
    const limit = testRun ? 1 : settings.autoEmailDailyLimit;
    let sentToday = await countEmailsSentToday();
    if (!testRun && !settings.autoEmailEnabled) {
      updateStatus({ running: false, phase: "disabled", message: "Automation stopped because automatic email sending is disabled.", sentToday, target: limit });
      return;
    }
    if (sentToday >= limit) {
      updateStatus({ running: false, phase: "done", message: "Daily email sending limit reached.", sentToday, target: limit });
      return;
    }

    const searchInput = randomSearchInput();
    updateStatus({
      phase: "searching",
      message: `Cycle ${iteration}: searching ${searchInput.keyword} in ${searchInput.cityArea}.`,
      iteration,
      sentToday,
      target: limit
    });

    let leadIds: number[] = [];
    try {
      const job = await runPlacesSearch(searchInput);
      leadIds = job.savedLeadIds;
      updateStatus({ searchesRun: getState().status.searchesRun + 1 });
    } catch (error) {
      updateStatus({
        running: false,
        phase: "error",
        message: error instanceof Error ? error.message : "Google Places search failed."
      });
      return;
    }

    const candidates = await getCandidateLeads(leadIds, searchInput.keyword, `${searchInput.cityArea}, ${searchInput.country}`);
    updateStatus({
      phase: "discovering",
      message: `Cycle ${iteration}: checking ${candidates.length} lead${candidates.length === 1 ? "" : "s"} for email addresses.`
    });

    let emailsFoundThisCycle = 0;
    let sentThisCycle = 0;
    const bodyTemplate = await getEmailBodyTemplate();
    for (const candidate of candidates) {
      sentToday = await countEmailsSentToday();
      if (sentToday >= limit) break;

      const discovery = await discoverLeadEmail(candidate.id);
      if (!discovery.email) continue;
      emailsFoundThisCycle += 1;
      updateStatus({
        phase: "sending",
        message: `Cycle ${iteration}: sending email to ${candidate.businessName}.`,
        emailsFound: getState().status.emailsFound + 1
      });

      const refreshed = await prisma.lead.findUnique({ where: { id: candidate.id } });
      const email = refreshed?.email || discovery.email;
      if (!refreshed || !email) continue;

      try {
        const sent = await sendLeadEmail({
          businessName: refreshed.businessName,
          email,
          subjectTemplate: emailSubjectTemplate,
          bodyTemplate
        });
        await prisma.emailLog.create({
          data: {
            leadId: refreshed.id,
            businessName: refreshed.businessName,
            email,
            status: "sent",
            subject: sent.subject,
            body: sent.body,
            sentAt: new Date()
          }
        });
        sentThisCycle += 1;
        updateStatus({
          emailsSent: getState().status.emailsSent + 1,
          sentToday: await countEmailsSentToday()
        });
      } catch (error) {
        await prisma.emailLog.create({
          data: {
            leadId: refreshed.id,
            businessName: refreshed.businessName,
            email,
            status: "failed",
            subject: emailSubjectTemplate.replace(/\[business_name\]/gi, refreshed.businessName),
            body: bodyTemplate.replace(/\[business_name\]/gi, refreshed.businessName),
            errorMessage: error instanceof Error ? error.message : "Unable to send email",
            sentAt: new Date()
          }
        });
        updateStatus({ emailFailed: getState().status.emailFailed + 1 });
      }
    }

    noProgressCycles = sentThisCycle > 0 || emailsFoundThisCycle > 0 || candidates.length > 0 ? 0 : noProgressCycles + 1;
    if (testRun) {
      updateStatus({
        running: false,
        phase: sentThisCycle > 0 ? "done" : "blocked",
        message: sentThisCycle > 0 ? "Test automatic email sending completed." : "Test automation did not find an email in the sampled search.",
        sentToday: await countEmailsSentToday(),
        target: 1
      });
      return;
    }
    if (noProgressCycles >= 10) {
      updateStatus({
        running: false,
        phase: "blocked",
        message: "Automation stopped after repeated searches without finding emailable leads.",
        sentToday: await countEmailsSentToday(),
        target: limit
      });
      return;
    }
  }

  updateStatus({
    running: false,
    phase: "blocked",
    message: "Automation stopped after the maximum search cycles for this run.",
    sentToday: await countEmailsSentToday()
  });
}

function randomSearchInput() {
  const province = randomItem(provinces);
  const cityArea = randomItem(philippinesLocations[province]);
  const keyword = randomItem(businessKeywords);
  return {
    country: "Philippines",
    cityArea,
    keyword,
    searchType: "TEXT_SEARCH" as const,
    maxResults: 10
  };
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

async function getCandidateLeads(leadIds: number[], searchKeyword: string, searchLocation: string) {
  return prisma.lead.findMany({
    where: {
      OR: [
        { id: { in: leadIds.length > 0 ? leadIds : [-1] } },
        { searchKeyword, searchLocation }
      ],
      emailLogs: { none: { status: "sent" } }
    },
    select: { id: true, businessName: true },
    orderBy: { createdAt: "desc" },
    take: 10
  });
}

function updateStatus(patch: Partial<AutomationStatus>) {
  const state = getState();
  state.status = {
    ...state.status,
    ...patch,
    updatedAt: new Date().toISOString()
  };
}

async function countEmailsSentToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.emailLog.count({
    where: {
      status: "sent",
      sentAt: { gte: today }
    }
  });
}
