import { DeleteLeadsButton } from "@/components/DeleteLeadsButton";
import { DebugSettingsPanel } from "@/components/DebugSettingsPanel";
import { EmailTemplateSettingsForm } from "@/components/EmailTemplateSettingsForm";
import { OperationsSettingsForm } from "@/components/OperationsSettingsForm";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { SmeSettingsForm } from "@/components/SmeSettingsForm";
import { SmsTemplateSettingsForm } from "@/components/SmsTemplateSettingsForm";
import { getDebugSettings } from "@/lib/debug-settings";
import { getEmailBodyTemplate, getEmailTemplateAttachmentMetadata } from "@/lib/email-template";
import { isSmeSearchEnabled } from "@/lib/feature-flags";
import { getOperationsSettings } from "@/lib/operations-settings";
import { getSmsBodyTemplate } from "@/lib/sms-template";
import { getSmeSettings } from "@/lib/sme/settings";
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
  const emailTemplateAttachment = await getEmailTemplateAttachmentMetadata();
  const smsBodyTemplate = await getSmsBodyTemplate();
  const operationsSettings = await getOperationsSettings();
  const debugSettings = await getDebugSettings();
  const smeSettings = await getSmeSettings();
  const smeEnabled = await isSmeSearchEnabled();
  const [zoneCount, brandCount] = await Promise.all([
    prisma.smeSearchZone.count(),
    prisma.franchiseBrand.count()
  ]);
  return (
    <section className="stack">
      <div className="page-title">
        <h1>Settings</h1>
        <p>Manage email and SMS defaults, saved lead data, and internal configuration.</p>
      </div>
      <OperationsSettingsForm settings={operationsSettings} />
      <EmailTemplateSettingsForm initialBody={emailBodyTemplate} initialAttachment={emailTemplateAttachment} />
      <SmsTemplateSettingsForm initialBody={smsBodyTemplate} />
      <SmeSettingsForm
        enabled={smeEnabled}
        weights={smeSettings.weights}
        thresholds={smeSettings.thresholds}
        zoneCount={zoneCount}
        brandCount={brandCount}
      />
      <DeleteLeadsButton leadCount={leadCount} />
      <DebugSettingsPanel settings={debugSettings} />
      <div className="panel settings-config-panel">
        <div className="settings-panel-body">
          <SettingPanelHeader title="Configuration" subtitle="Review environment values and internal app configuration." />
        </div>
        <div className="detail-list">
          <div className="detail-row"><span>App mode</span><strong>{process.env.APP_MODE || "office_lan_mvp"}</strong></div>
          <div className="detail-row"><span>Allowed CIDRs</span><strong>{process.env.OFFICE_ALLOWED_CIDRS || "localhost only"}</strong></div>
          <div className="detail-row"><span>Internal access URL</span><strong>http://&lt;host-pc-private-ip&gt;:3000</strong></div>
          <div className="detail-row"><span>Serper API key</span><strong>{masked(process.env.SERPER_API_KEY)}</strong></div>
          <div className="detail-row"><span>Database path</span><strong>{process.env.DATABASE_URL || "file:./data/leads.sqlite"}</strong></div>
          <div className="detail-row"><span>Export folder</span><strong>{process.env.EXPORT_DIR || "./exports"}</strong></div>
        </div>
      </div>
    </section>
  );
}
