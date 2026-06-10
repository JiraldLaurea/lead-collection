import { EmailLogTable } from "@/components/EmailLogTable";
import type { EmailLogFilters } from "@/components/EmailLogFiltersModal";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";
import type { Prisma } from "@prisma/client";

export default async function EmailLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAdmin();
  const params = await searchParams;
  const filters: EmailLogFilters = {
    from: typeof params.from === "string" ? params.from : "",
    to: typeof params.to === "string" ? params.to : "",
    businessName: typeof params.businessName === "string" ? params.businessName : "",
    email: typeof params.email === "string" ? params.email : "",
    status: typeof params.status === "string" ? params.status : ""
  };
  const where = buildEmailLogWhere(filters);
  const logs = await prisma.emailLog.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: 100
  });

  return (
    <section className="stack">
      <div className="page-title">
        <h1>Email Log</h1>
        <p>Sent outreach emails with recipient details and message content.</p>
      </div>
      <EmailLogTable
        filters={filters}
        logs={logs.map((log) => ({
          id: log.id,
          leadId: log.leadId,
          sentAt: log.sentAt.toLocaleString(),
          businessName: log.businessName,
          email: log.email,
          status: log.status.replaceAll("_", " "),
          subject: log.subject ?? "(No subject)",
          body: log.body ?? "",
          errorMessage: log.errorMessage
        }))}
      />
    </section>
  );
}

function buildEmailLogWhere(filters: EmailLogFilters): Prisma.EmailLogWhereInput {
  const where: Prisma.EmailLogWhereInput = {};

  if (filters.from || filters.to) {
    where.sentAt = {};
    if (filters.from) where.sentAt.gte = new Date(`${filters.from}T00:00:00`);
    if (filters.to) where.sentAt.lt = new Date(new Date(`${filters.to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);
  }

  if (filters.businessName.trim()) {
    where.businessName = { contains: filters.businessName.trim() };
  }

  if (filters.email.trim()) {
    where.email = { contains: filters.email.trim() };
  }

  if (filters.status.trim()) {
    where.status = filters.status.trim();
  }

  return where;
}
