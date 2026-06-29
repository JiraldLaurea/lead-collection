import { notFound } from "next/navigation";
import Link from "next/link";
import { LeadDetailActions } from "@/components/LeadDetailActions";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { emailStatusPillClassName, formatCategoryLabel, formatCity, formatDateTime, formatEmailStatus } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAdmin();
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id: Number(id) } });
  if (!lead) notFound();
  const na = "N/A";
  const emailStatus = formatEmailStatus(lead.emailStatus);
  const emailBodyTemplate = await getEmailBodyTemplate();
  return (
    <section className="stack">
      <div className="page-heading">
        <Link href="/leads" className="button back-button">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H5" />
            <path d="m12 19-7-7 7-7" />
          </svg>
          Back to Leads List
        </Link>
        <div className="detail-heading-bar">
          <div className="page-title">
            <h1>{lead.businessName}</h1>
            <p>Review lead details, contact information, and email outreach actions.</p>
          </div>
          <LeadDetailActions leadId={lead.id} businessName={lead.businessName} email={lead.email} emailBodyTemplate={emailBodyTemplate} />
        </div>
      </div>
      <div className="panel detail-panel">
        <div className="detail-list">
          <div className="detail-row"><span>City</span><strong>{formatCity(lead.searchLocation)}</strong></div>
          <div className="detail-row"><span>Address</span><strong>{lead.formattedAddress || na}</strong></div>
          <div className="detail-row"><span>Category</span><strong>{formatCategoryLabel(lead.category)}</strong></div>
          <div className="detail-row"><span>Phone</span><strong>{lead.phoneNumber || na}</strong></div>
          <div className="detail-row"><span>Email</span><strong>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : na}</strong></div>
          <div className="detail-row"><span>Email Status</span><strong><span className={emailStatusPillClassName(lead.emailStatus)}>{emailStatus}</span></strong></div>
          <div className="detail-row"><span>Email Source</span><strong>{lead.emailSource ? <a href={lead.emailSource} target="_blank" rel="noopener noreferrer">{lead.emailSource}</a> : na}</strong></div>
          <div className="detail-row"><span>Website</span><strong>{lead.websiteUrl ? <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer">{lead.websiteUrl}</a> : na}</strong></div>
          <div className="detail-row"><span>Google Maps</span><strong>{lead.googleMapsUrl ? <a href={lead.googleMapsUrl} target="_blank" rel="noopener noreferrer">{lead.googleMapsUrl}</a> : na}</strong></div>
          <div className="detail-row"><span>Rating</span><strong>{lead.rating ?? na} ({lead.reviewCount ?? 0} reviews)</strong></div>
          <div className="detail-row"><span>Search</span><strong>{lead.searchKeyword} in {lead.searchLocation}</strong></div>
          <div className="detail-row"><span>Searched</span><strong>{formatDateTime(lead.collectedAt)}</strong></div>
        </div>
      </div>
    </section>
  );
}
