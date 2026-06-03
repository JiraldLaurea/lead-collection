"use client";

import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { defaultEmailBodyTemplate } from "@/lib/email-template-defaults";

type EmailTemplateSettingsFormProps = {
  initialBody: string;
};

export function EmailTemplateSettingsForm({ initialBody }: EmailTemplateSettingsFormProps) {
  const [body, setBody] = useState(initialBody);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setLoading(true);
    const response = await fetch("/api/settings/email-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      setNoticeType("success");
      setNotice("Email template saved.");
      setBody(payload.data.body);
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save email template.");
  }

  return (
    <form className="settings-template-form" onSubmit={saveTemplate}>
      {loading ? <LoadingModal label="Saving email template" /> : null}
      <div>
        <h2>Email Template</h2>
        <p className="muted">This body will be used as the default message when composing emails.</p>
      </div>
      <label>
        Body
        <textarea className="settings-template-textarea" value={body} onChange={(event) => setBody(event.target.value)} rows={14} />
      </label>
      <p className="muted compose-hint">Use [business_name] to personalize each email.</p>
      {notice ? <div className={`notice ${noticeType === "success" ? "notice-success" : "notice-error"}`}>{notice}</div> : null}
      <div className="settings-template-actions">
        <button type="button" className="secondary" onClick={() => setBody(defaultEmailBodyTemplate)} disabled={loading}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          Reset
        </button>
        <button type="submit" disabled={loading || !body.trim()}>
          Save Template
        </button>
      </div>
    </form>
  );
}
