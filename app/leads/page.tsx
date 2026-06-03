import { LeadSelectionTable } from "@/components/LeadSelectionTable";
import { SearchForm } from "@/components/SearchForm";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere, parseLeadFilters } from "@/lib/leads";
import { requirePageAdmin } from "@/lib/require-auth";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAdmin();
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") urlParams.set(key, value);
  });
  const filters = parseLeadFilters(urlParams);
  const searchStatus = urlParams.get("searchStatus");
  const found = urlParams.get("found") ?? "0";
  const saved = urlParams.get("saved") ?? "0";
  const duplicates = urlParams.get("duplicates") ?? "0";
  const leads = await prisma.lead.findMany({
    where: buildLeadWhere(filters),
    orderBy: { collectedAt: "desc" },
    take: 100
  });
  const categoryRows = await prisma.lead.findMany({
    distinct: ["category"],
    where: { category: { not: null } },
    orderBy: { category: "asc" },
    select: { category: true }
  });
  const categories = categoryRows
    .map((row) => row.category)
    .filter((category): category is string => Boolean(category));
  const websiteFilterValue = filters.hasWebsite === true ? "true" : filters.hasWebsite === false ? "false" : "";
  const phoneFilterValue = filters.hasPhone === true ? "true" : filters.hasPhone === false ? "false" : "";
  const emailBodyTemplate = await getEmailBodyTemplate();
  return (
    <section className="stack leads-page">
      <div className="page-title">
        <h1>Leads</h1>
        <p>Manage collected business leads, discover contact emails, and prepare outreach.</p>
      </div>
      {searchStatus === "success" ? (
        <div className="notice notice-success">
          Search completed successfully. Found {found} leads, saved {saved}, skipped {duplicates} duplicates.
        </div>
      ) : null}
      <section className="stack">
        <SearchForm />
      </section>
      <LeadSelectionTable
        leads={leads}
        filters={filters}
        categories={categories}
        websiteFilterValue={websiteFilterValue}
        phoneFilterValue={phoneFilterValue}
        emailBodyTemplate={emailBodyTemplate}
      />
      {leads.length === 0 ? <p className="muted">No leads found.</p> : null}
    </section>
  );
}
