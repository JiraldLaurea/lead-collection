"use client";

import { useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";
import { measureSms } from "@/lib/sms-length";
import { defaultSmsBodyTemplate } from "@/lib/sms-template-defaults";

type SmsTemplateSettingsFormProps = {
  initialBody: string;
};

const businessNamePlaceholder = "[business_name]";
const sampleBusinessName = "Aguirre Garden Cafe";

export function SmsTemplateSettingsForm({ initialBody }: SmsTemplateSettingsFormProps) {
  const [body, setBody] = useState(initialBody);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Length is measured on a rendered preview, not the raw template: "[business_name]" is
  // 15 characters but the real name that replaces it rarely is, and the difference can
  // push a message into a second billable segment.
  const preview = body.split(businessNamePlaceholder).join(sampleBusinessName);
  const length = measureSms(preview);

  function insertBusinessNamePlaceholder() {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody((current) => `${current}${current ? " " : ""}${businessNamePlaceholder}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody(`${body.slice(0, start)}${businessNamePlaceholder}${body.slice(end)}`);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursorPosition = start + businessNamePlaceholder.length;
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  async function saveTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setLoading(true);

    const response = await fetch("/api/settings/sms-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      setNoticeType("success");
      setNotice("SMS template saved.");
      setBody(payload.data.body);
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save SMS template.");
  }

  return (
    <form className="panel settings-panel settings-template-form" onSubmit={saveTemplate}>
      {loading ? <LoadingModal label="Saving SMS template" /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="settings-panel-body">
        <SettingPanelHeader
          title="SMS Template"
          subtitle="This body will be used as the default message when sending SMS."
        />
        <label>
          Body
          <textarea
            ref={textareaRef}
            className="settings-template-textarea sms-template-textarea"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={6}
            maxLength={1000}
          />
        </label>
        <div className="settings-template-helper">
          <button
            type="button"
            className="secondary compact-button"
            onClick={insertBusinessNamePlaceholder}
            disabled={loading}
          >
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add [business_name]
          </button>
        </div>
        <div className="field-group">
          <span>Preview</span>
          <p className="sms-template-preview">{preview || "—"}</p>
          <span className="field-note">
            {length.characters} characters · {length.segments} SMS segment{length.segments === 1 ? "" : "s"} ·{" "}
            {length.encoding}
            {length.encoding === "UCS-2"
              ? " — a special character forced Unicode encoding, which cuts each segment to 70 characters."
              : ""}
          </span>
          <span className="field-note">
            Preview uses the sample name &quot;{sampleBusinessName}&quot;. Longer business names may add a segment.
          </span>
        </div>
      </div>
      <div className="settings-panel-footer">
        <button
          type="button"
          className="secondary"
          onClick={() => setBody(defaultSmsBodyTemplate)}
          disabled={loading}
        >
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          Reset
        </button>
        <button type="submit" disabled={loading || !body.trim()}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
          Save Template
        </button>
      </div>
    </form>
  );
}
