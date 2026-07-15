import { LeadSelectionTable } from "@/components/LeadSelectionTable";
import { PageSnackbar } from "@/components/PageSnackbar";
import { SearchForm } from "@/components/SearchForm";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { getSmsBodyTemplate } from "@/lib/sms-template";
import { prisma } from "@/lib/prisma";
import { buildLeadWhere, parseLeadFilters } from "@/lib/leads";
import { requirePageAdmin } from "@/lib/require-auth";
import { isSmeSearchEnabled } from "@/lib/feature-flags";
import { redirect } from "next/navigation";

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAdmin();
  if (await isSmeSearchEnabled()) redirect("/sme-search");
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") urlParams.set(key, value);
  });
  const filters = parseLeadFilters(urlParams);
  const pageSize = normalizePageSize(urlParams.get("pageSize"));
  const requestedPage = normalizePage(urlParams.get("page"));
  const searchStatus = urlParams.get("searchStatus");
  const searchCount = Number(urlParams.get("searchCount") || 0);
  const searchToastId = urlParams.get("searchToastId") || undefined;
  const searchMessage =
    searchCount > 0
      ? `Search completed successfully. Saved ${searchCount} new lead${searchCount === 1 ? "" : "s"}.`
      : "Search completed successfully. No new leads found.";
  const where = buildLeadWhere(filters);
  const totalLeads = await prisma.lead.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalLeads / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const leads = await prisma.lead.findMany({
    where,
    orderBy: { collectedAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize
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
  const emailFilterValue = filters.hasEmail === true ? "true" : filters.hasEmail === false ? "false" : "";
  const emailBodyTemplate = await getEmailBodyTemplate();
  const smsBodyTemplate = await getSmsBodyTemplate();
  return (
    <section className="stack leads-page">
      <div className="page-title">
        <h1>Leads</h1>
        <p>Manage collected business leads, discover contact emails, and prepare outreach.</p>
      </div>
      {searchStatus === "success" ? (
        <PageSnackbar
          message={searchMessage}
          triggerKey={searchToastId}
          clearParams={["searchStatus", "searchCount", "searchToastId"]}
        />
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
        emailFilterValue={emailFilterValue}
        emailBodyTemplate={emailBodyTemplate}
        smsBodyTemplate={smsBodyTemplate}
        totalCount={totalLeads}
        currentPage={currentPage}
        pageSize={pageSize}
        totalPages={totalPages}
      />
      {leads.length === 0 ? <p className="muted">No leads found.</p> : null}
    </section>
  );
}

function normalizePage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.floor(parsed));
}

function normalizePageSize(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  const allowed = [50, 100, 200];
  return allowed.includes(parsed) ? parsed : 100;
}
