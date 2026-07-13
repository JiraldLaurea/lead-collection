import { ManualSmsForm } from "@/components/ManualSmsForm";
import { requirePageAdmin } from "@/lib/require-auth";
import { defaultSmsBodyTemplate } from "@/lib/sms-template-defaults";

export default async function SendSmsPage() {
  await requirePageAdmin();
  return (
    <section className="stack manual-email-page">
      <div className="page-title">
        <h1>Send SMS</h1>
        <p>Send SMS messages directly to Philippine mobile numbers through the configured SMPP provider.</p>
      </div>
      <ManualSmsForm defaultBody={defaultSmsBodyTemplate} />
    </section>
  );
}
