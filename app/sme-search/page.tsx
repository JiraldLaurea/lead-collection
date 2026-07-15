import { SmeSearchWorkspace } from "@/components/SmeSearchWorkspace";
import { prisma } from "@/lib/prisma";
import { metroManilaCities } from "@/lib/philippines-locations";
import { requirePageAdmin, requireSmeSearchPage } from "@/lib/require-auth";
import { getSmsBodyTemplate } from "@/lib/sms-template";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { getRecentPersistedSmeResults } from "@/lib/sme/persist-results";
import { getLatestScheduledSmeSearchSnapshot } from "@/lib/sme/scheduled-search";
import { getScheduledSmeSearchSettings } from "@/lib/sme/scheduled-search";

export default async function SmeSearchPage() {
  await requirePageAdmin();
  await requireSmeSearchPage();

  const [smsBodyTemplate, emailBodyTemplate, persistedResults, scheduledSearch, scheduledSearchSettings] = await Promise.all([
    getSmsBodyTemplate(),
    getEmailBodyTemplate(),
    getRecentPersistedSmeResults(),
    getLatestScheduledSmeSearchSnapshot(),
    getScheduledSmeSearchSettings()
  ]);
  const initialResults = persistedResults;

  const zones = await prisma.smeSearchZone.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { city: "asc" }, { roadName: "asc" }],
    select: {
      id: true,
      city: true,
      commercialArea: true,
      roadName: true,
      latitude: true,
      longitude: true,
      radiusMeters: true,
      priority: true
    }
  });

  const cities = metroManilaCities;

  return (
    <section className="stack leads-page">
      <div className="page-title">
        <h1>SME Search</h1>
        <p>
          Find independent and local businesses through Google Places, exclude large franchises, and
          review qualified SME candidates.
        </p>
      </div>
      <SmeSearchWorkspace
        cities={cities}
        zones={zones}
        smsBodyTemplate={smsBodyTemplate}
        emailBodyTemplate={emailBodyTemplate}
        initialResults={initialResults}
        scheduledSearchSettings={scheduledSearchSettings}
        scheduledSearch={scheduledSearch ? {
          searchRunId: scheduledSearch.searchRunId,
          completedAt: scheduledSearch.completedAt,
          zoneLabel: scheduledSearch.zoneLabel,
          resultCount: scheduledSearch.results.length,
          summary: scheduledSearch.summary
        } : null}
      />
      {zones.length === 0 ? (
        <p className="muted">
          No commercial roads are configured yet. Import{" "}
          <code>docs/templates/search-zones-template.csv</code> to enable road searches, or use another
          search mode.
        </p>
      ) : null}
    </section>
  );
}
