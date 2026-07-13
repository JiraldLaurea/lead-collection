import { CsvLeadWorkspace } from "@/components/CsvLeadWorkspace";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";
import { getSmsBodyTemplate } from "@/lib/sms-template";

export default async function CsvLeadsPage() {
  await requirePageAdmin();
  const [importedLeads, emailBodyTemplate, smsBodyTemplate] = await Promise.all([
    prisma.importedCsvLead.findMany({
      include: { import: { select: { fileName: true, importedAt: true } } }
    }),
    getEmailBodyTemplate(),
    getSmsBodyTemplate()
  ]);
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  const leads = importedLeads.sort((left, right) => {
    if (!left.clientId && !right.clientId) return left.id - right.id;
    if (!left.clientId) return 1;
    if (!right.clientId) return -1;
    return collator.compare(left.clientId, right.clientId) || left.id - right.id;
  });
  return <section className="stack leads-page"><div className="page-title"><h1>CSV Leads</h1><p>Import and contact external lead lists without mixing them into app-generated leads.</p></div><CsvLeadWorkspace leads={leads} emailBodyTemplate={emailBodyTemplate} smsBodyTemplate={smsBodyTemplate} /></section>;
}
