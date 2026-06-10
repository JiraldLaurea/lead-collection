"use client";

import { useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";
import { defaultEmailBodyTemplate } from "@/lib/email-template-defaults";
import type { EmailTemplateAttachmentMetadata } from "@/lib/email-template";

type EmailTemplateSettingsFormProps = {
  initialBody: string;
  initialAttachment: EmailTemplateAttachmentMetadata | null;
};

export function EmailTemplateSettingsForm({ initialBody, initialAttachment }: EmailTemplateSettingsFormProps) {
  const [body, setBody] = useState(initialBody);
  const [defaultAttachment, setDefaultAttachment] = useState<EmailTemplateAttachmentMetadata | null>(initialAttachment);
  const [selectedDefaultAttachment, setSelectedDefaultAttachment] = useState<File | null>(null);
  const [removeDefaultAttachment, setRemoveDefaultAttachment] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const businessNamePlaceholder = "[business_name]";

  function insertBusinessNamePlaceholder() {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBody((current) => `${current}${current ? " " : ""}${businessNamePlaceholder}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextBody = `${body.slice(0, start)}${businessNamePlaceholder}${body.slice(end)}`;
    setBody(nextBody);

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
    const formData = new FormData();
    formData.append("body", body);
    if (selectedDefaultAttachment) {
      formData.append("defaultAttachment", selectedDefaultAttachment);
    }
    if (removeDefaultAttachment) {
      formData.append("removeDefaultAttachment", "true");
    }
    const response = await fetch("/api/settings/email-template", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      setNoticeType("success");
      setNotice("Email template saved.");
      setBody(payload.data.body);
      setDefaultAttachment(payload.data.attachment);
      setSelectedDefaultAttachment(null);
      setRemoveDefaultAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save email template.");
  }

  function chooseDefaultAttachment(fileList: FileList | null) {
    const [file] = fileList ? Array.from(fileList) : [];
    if (!file) return;
    setSelectedDefaultAttachment(file);
    setRemoveDefaultAttachment(false);
  }

  function removeAttachmentSelection() {
    setSelectedDefaultAttachment(null);
    setRemoveDefaultAttachment(Boolean(defaultAttachment));
    if (attachmentInputRef.current) attachmentInputRef.current.value = "";
  }

  const displayedAttachmentName = selectedDefaultAttachment?.name || (!removeDefaultAttachment ? defaultAttachment?.filename : null);
  const displayedAttachmentSize = selectedDefaultAttachment?.size || (!removeDefaultAttachment ? defaultAttachment?.size : null);

  return (
    <form className="panel settings-panel settings-template-form" onSubmit={saveTemplate}>
      {loading ? <LoadingModal label="Saving email template" /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="settings-panel-body">
        <SettingPanelHeader title="Email Template" subtitle="This body will be used as the default message when composing emails." />
        <label>
          Body
          <textarea ref={textareaRef} className="settings-template-textarea" value={body} onChange={(event) => setBody(event.target.value)} rows={14} />
        </label>
        <div className="settings-template-helper">
          <button type="button" className="secondary compact-button" onClick={insertBusinessNamePlaceholder} disabled={loading}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            Add [business_name]
          </button>
        </div>
        <div className="field-group">
          <span>Default attachment</span>
          <input
            ref={attachmentInputRef}
            className="file-upload-input"
            type="file"
            onChange={(event) => {
              chooseDefaultAttachment(event.target.files);
            }}
            disabled={loading}
          />
          <button type="button" className="secondary compact-button" onClick={() => attachmentInputRef.current?.click()} disabled={loading}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
              <path d="M8 13h8" />
              <path d="M8 17h5" />
            </svg>
            Choose file
          </button>
          <span className="field-note">This file is attached by default to manual and automatic outreach emails. 10MB max.</span>
        </div>
        {displayedAttachmentName ? (
          <div className="attachment-list">
            <span className="attachment-pill">
              {displayedAttachmentName}{displayedAttachmentSize ? ` (${formatFileSize(displayedAttachmentSize)})` : ""}
              <button type="button" aria-label={`Remove ${displayedAttachmentName}`} onClick={removeAttachmentSelection} disabled={loading}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </span>
          </div>
        ) : null}
      </div>
      <div className="settings-panel-footer">
        <button type="button" className="secondary" onClick={() => setBody(defaultEmailBodyTemplate)} disabled={loading}>
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

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))}KB`;
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}
