import { SmeSearchWorkspace } from "@/components/SmeSearchWorkspace";
import { prisma } from "@/lib/prisma";
import { fixedSearchCities } from "@/lib/search-defaults";
import { philippinesCityCoordinates } from "@/lib/philippines-locations";
import { requirePageAdmin, requireSmeSearchPage } from "@/lib/require-auth";

export default async function SmeSearchPage() {
  await requirePageAdmin();
  await requireSmeSearchPage();

  const zones = await prisma.smeSearchZone.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { city: "asc" }, { roadName: "asc" }],
    select: {
      city: true,
      commercialArea: true,
      roadName: true,
      latitude: true,
      longitude: true,
      radiusMeters: true
    }
  });

  const cities = Array.from(
    new Set([...fixedSearchCities, ...Object.keys(philippinesCityCoordinates), ...zones.map((zone) => zone.city)])
  ).sort();

  return (
    <section className="stack leads-page">
      <div className="page-title">
        <h1>SME Search</h1>
        <p>
          Find independent and local businesses through Google Places, exclude large franchises, and
          review qualified SME candidates.
        </p>
      </div>
      <SmeSearchWorkspace cities={cities} zones={zones} />
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
