import { SmsLogTable } from "@/components/SmsLogTable";
import type { SmsLogFilters } from "@/components/SmsLogFiltersModal";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";
import type { Prisma } from "@prisma/client";

export default async function SmsLogPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePageAdmin();
  const params = await searchParams;
  const filters: SmsLogFilters = {
    from: typeof params.from === "string" ? params.from : "",
    to: typeof params.to === "string" ? params.to : "",
    businessName: typeof params.businessName === "string" ? params.businessName : "",
    phone: typeof params.phone === "string" ? params.phone : "",
    provider: typeof params.provider === "string" ? params.provider : "",
    status: typeof params.status === "string" ? params.status : "",
    deliveryStatus: typeof params.deliveryStatus === "string" ? params.deliveryStatus : ""
  };
  const where = buildSmsLogWhere(filters);
  const logs = await prisma.smsLog.findMany({
    where,
    orderBy: { sentAt: "desc" },
    take: 100
  });

  return (
    <section className="stack">
      <div className="page-title">
        <h1>SMS Log</h1>
        <p>Sent SMS attempts with recipient details, provider results, and message content.</p>
      </div>
      <SmsLogTable
        filters={filters}
        logs={logs.map((log) => ({
          id: log.id,
          leadId: log.leadId,
          sentAt: log.sentAt.toLocaleString(),
          businessName: log.businessName,
          phone: log.phone,
          status: log.status.replaceAll("_", " "),
          provider: log.provider ?? "(No provider)",
          providerMessageId: log.providerMessageId,
          deliveryStatus: log.deliveryStatus,
          deliveryError: log.deliveryError,
          deliveryReceipt: log.deliveryReceipt,
          deliveredAt: log.deliveredAt?.toLocaleString() ?? null,
          body: log.body ?? "",
          errorMessage: log.errorMessage
        }))}
      />
    </section>
  );
}

function buildSmsLogWhere(filters: SmsLogFilters): Prisma.SmsLogWhereInput {
  const where: Prisma.SmsLogWhereInput = {};

  if (filters.from || filters.to) {
    where.sentAt = {};
    if (filters.from) where.sentAt.gte = new Date(`${filters.from}T00:00:00`);
    if (filters.to) where.sentAt.lt = new Date(new Date(`${filters.to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000);
  }

  if (filters.businessName.trim()) {
    where.businessName = { contains: filters.businessName.trim() };
  }

  if (filters.phone.trim()) {
    where.phone = { contains: filters.phone.trim() };
  }

  if (filters.provider.trim()) {
    where.provider = { contains: filters.provider.trim() };
  }

  if (filters.status.trim()) {
    where.status = filters.status.trim();
  }

  if (filters.deliveryStatus.trim()) {
    where.deliveryStatus = { contains: filters.deliveryStatus.trim() };
  }

  return where;
}
