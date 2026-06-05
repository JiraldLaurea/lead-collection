import { EmailLogTable } from "@/components/EmailLogTable";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";

export default async function EmailLogPage() {
  await requirePageAdmin();
  const logs = await prisma.emailLog.findMany({
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
        logs={logs.map((log) => ({
          id: log.id,
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
