import { ManualSmsForm } from "@/components/ManualSmsForm";
import { requirePageAdmin } from "@/lib/require-auth";
import { getSmsBodyTemplate } from "@/lib/sms-template";

export default async function SendSmsPage() {
  await requirePageAdmin();
  const smsBodyTemplate = await getSmsBodyTemplate();
  return (
    <section className="stack manual-email-page">
      <div className="page-title">
        <h1>Send SMS</h1>
        <p>Send SMS messages directly to Philippine mobile numbers through the configured SMPP provider.</p>
      </div>
      <ManualSmsForm defaultBody={smsBodyTemplate} />
    </section>
  );
}
