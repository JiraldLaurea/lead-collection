import { autoOutreachLastSearchSettingKey } from "@/lib/auto-outreach";
import { ok } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/require-auth";
import { scheduledSmeSearchLastRunKey, scheduledSmeSearchSnapshotKey } from "@/lib/sme/scheduled-search";

/**
 * Clears collected data only. Reference/config data is preserved: franchise brands, search zones,
 * the Do-Not-Contact list, templates and every other app setting. Admin login is env-based
 * ([lib/auth.ts]), so it is unaffected and needs no reseed.
 */
export async function DELETE() {
  const authError = await requireApiAdmin();
  if (authError) return authError;

  // Delete child rows before parents. Also drop the stale snapshot/day-guard settings that point at
  // now-deleted runs so the UI does not show results for records that no longer exist.
  const [
    contactActivities,
    leadListItems,
    ,
    smeLeadScores,
    smeClassifications,
    smsLogs,
    emailLogs,
    smeBusinessProfiles,
    ,
    smeSearchRuns,
    ,
    ,
    ,
    leads
  ] = await prisma.$transaction([
    prisma.contactActivity.deleteMany(),
    prisma.leadListItem.deleteMany(),
    prisma.leadList.deleteMany(),
    prisma.smeLeadScore.deleteMany(),
    prisma.smeClassification.deleteMany(),
    prisma.smsLog.deleteMany(),
    prisma.emailLog.deleteMany(),
    prisma.smeBusinessProfile.deleteMany(),
    prisma.smePlaceReference.deleteMany(),
    prisma.smeSearchRun.deleteMany(),
    prisma.importedCsvLead.deleteMany(),
    prisma.csvImport.deleteMany(),
    prisma.searchJob.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.appSetting.deleteMany({
      where: { key: { in: [scheduledSmeSearchSnapshotKey, scheduledSmeSearchLastRunKey, autoOutreachLastSearchSettingKey] } }
    })
  ]);

  return ok({
    deletedLeads: leads.count,
    deletedBusinessProfiles: smeBusinessProfiles.count,
    deletedSearchRuns: smeSearchRuns.count,
    deletedSmsLogs: smsLogs.count,
    deletedEmailLogs: emailLogs.count,
    deletedContactActivities: contactActivities.count,
    deletedClassifications: smeClassifications.count,
    deletedScores: smeLeadScores.count,
    deletedLeadListItems: leadListItems.count
  });
}
