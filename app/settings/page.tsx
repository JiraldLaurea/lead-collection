import { DeleteLeadsButton } from "@/components/DeleteLeadsButton";
import { EmailTemplateSettingsForm } from "@/components/EmailTemplateSettingsForm";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { prisma } from "@/lib/prisma";
import { requirePageAdmin } from "@/lib/require-auth";

function masked(value?: string) {
  if (!value || value.startsWith("replace_")) return "not configured";
  return `configured ending in ${value.slice(-4)}`;
}

export default async function SettingsPage() {
  await requirePageAdmin();
  const leadCount = await prisma.lead.count();
  const emailBodyTemplate = await getEmailBodyTemplate();
  return (
    <section className="stack">
      <div className="page-title">
        <h1>Settings</h1>
        <p>Manage email defaults, saved lead data, and internal configuration.</p>
      </div>
      <div className="panel">
        <EmailTemplateSettingsForm initialBody={emailBodyTemplate} />
      </div>
      <div className="panel">
        <DeleteLeadsButton leadCount={leadCount} />
      </div>
      <div className="panel settings-config-panel">
        <h2 className="settings-section-title">Configuration</h2>
        <div className="detail-list">
          <div className="detail-row"><span>App mode</span><strong>{process.env.APP_MODE || "office_lan_mvp"}</strong></div>
          <div className="detail-row"><span>Allowed CIDRs</span><strong>{process.env.OFFICE_ALLOWED_CIDRS || "localhost only"}</strong></div>
          <div className="detail-row"><span>Internal access URL</span><strong>http://&lt;host-pc-private-ip&gt;:3000</strong></div>
          <div className="detail-row"><span>Google Places API key</span><strong>{masked(process.env.GOOGLE_MAPS_API_KEY)}</strong></div>
          <div className="detail-row"><span>Database path</span><strong>{process.env.DATABASE_URL || "file:./data/leads.sqlite"}</strong></div>
          <div className="detail-row"><span>Export folder</span><strong>{process.env.EXPORT_DIR || "./exports"}</strong></div>
        </div>
      </div>
    </section>
  );
}
