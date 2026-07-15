import Link from "next/link";
import { ScheduledSearchCompletionToast } from "@/components/ScheduledSearchCompletionToast";
import { SmeSearchWorkspace } from "@/components/SmeSearchWorkspace";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin, requireSmeSearchPage } from "@/lib/require-auth";
import { getSmsBodyTemplate } from "@/lib/sms-template";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { getLatestScheduledSmeSearchSnapshot, getScheduledSmeSearchSettings } from "@/lib/sme/scheduled-search";
import { fixedSearchCities } from "@/lib/search-defaults";

export default async function ScheduledSmeResultsPage({ searchParams }: { searchParams: Promise<{ completed?: string }> }) {
  await requirePageAdmin();
  await requireSmeSearchPage();

  const [smsBodyTemplate, emailBodyTemplate, scheduledSearch, scheduledSearchSettings, zones] = await Promise.all([
    getSmsBodyTemplate(),
    getEmailBodyTemplate(),
    getLatestScheduledSmeSearchSnapshot(),
    getScheduledSmeSearchSettings(),
    prisma.smeSearchZone.findMany({
      where: { enabled: true },
      orderBy: [{ priority: "asc" }, { city: "asc" }, { roadName: "asc" }],
      select: { id: true, city: true, commercialArea: true, roadName: true, latitude: true, longitude: true, radiusMeters: true, priority: true }
    })
  ]);

  const cities = Array.from(new Set([...fixedSearchCities, ...zones.map((zone) => zone.city)])).sort();
  const showCompletionToast = (await searchParams).completed === "1";

  return (
    <section className="stack leads-page">
      {showCompletionToast ? <ScheduledSearchCompletionToast /> : null}
      <div className="channel-page-header scheduled-results-page-header">
        <Link href="/sme-search" className="compose-back-link">Back to SME Search</Link>
        <div className="page-title">
          <h1>Scheduled Search Results</h1>
          <p>{scheduledSearch ? `Completed ${new Date(scheduledSearch.completedAt).toLocaleString()} · ${scheduledSearch.zoneLabel}` : "No scheduled search has completed yet."}</p>
        </div>
      </div>
      {scheduledSearch ? (
        <div className="scheduled-results-explainer">
          <strong>{scheduledSearch.discoveredCount ?? scheduledSearch.summary.total} business{(scheduledSearch.discoveredCount ?? scheduledSearch.summary.total) === 1 ? "" : "es"} discovered</strong>
          <span>{scheduledSearch.results.length} met the Grade A requirement and are shown below.</span>
          {scheduledSearch.results.length === 0 && scheduledSearch.scoreBands ? (
            <span>Score distribution: {Object.entries(scheduledSearch.scoreBands).map(([band, count]) => `${band}: ${count}`).join(" · ") || "no scored businesses"}. Increase the maximum results, widen the radius, or select a category to find more candidates.</span>
          ) : null}
        </div>
      ) : null}
      <SmeSearchWorkspace
        cities={cities}
        zones={zones}
        smsBodyTemplate={smsBodyTemplate}
        emailBodyTemplate={emailBodyTemplate}
        initialResults={scheduledSearch?.results ?? []}
        scheduledSearchSettings={scheduledSearchSettings}
        scheduledSearch={scheduledSearch ? {
          searchRunId: scheduledSearch.searchRunId,
          completedAt: scheduledSearch.completedAt,
          zoneLabel: scheduledSearch.zoneLabel,
          resultCount: scheduledSearch.results.length,
          summary: scheduledSearch.summary
        } : null}
        showSearchForm={false}
      />
    </section>
  );
}
