import { ManualEmailForm } from "@/components/ManualEmailForm";
import { getEmailBodyTemplate } from "@/lib/email-template";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { requirePageAdmin } from "@/lib/require-auth";

export default async function ComposeEmailPage() {
  await requirePageAdmin();
  const template = await getEmailBodyTemplate();
  const defaultSubject = emailSubjectTemplate.replace(/\s*-\s*\[business_name\]/gi, "").trim();
  const defaultBody = template.replace(/\[business_name\]/gi, "there");
  return <section className="stack manual-email-page"><div className="page-title"><h1>Compose Email</h1><p>Send a message directly to email addresses without creating lead records.</p></div><ManualEmailForm defaultSubject={defaultSubject} defaultBody={defaultBody} /></section>;
}
