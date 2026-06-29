"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-timeout";

type LeadDetailActionsProps = {
  leadId: number;
  businessName: string;
  email: string | null;
  emailBodyTemplate: string;
};

export function LeadDetailActions({ leadId, businessName, email, emailBodyTemplate }: LeadDetailActionsProps) {
  const router = useRouter();
  const [loadingLabel, setLoadingLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("error");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState(emailSubjectTemplate);
  const [emailBody, setEmailBody] = useState(emailBodyTemplate);
  const [attachments, setAttachments] = useState<File[]>([]);
  const emailBodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputId = useId();
  const businessNamePlaceholder = "[business_name]";
  const hasEmail = Boolean(email);

  async function findEmail() {
    setNotice("");
    setLoadingLabel("Finding email");
    try {
      await fetchWithTimeout(`/api/leads/${leadId}/discover-email`, { method: "POST" }, 20000);
      router.refresh();
    } catch (error) {
      setNotice(isAbortError(error) ? "Finding email timed out. Please try again." : "Unable to find email.");
    } finally {
      setLoadingLabel("");
    }
  }

  async function deleteLead() {
    setLoadingLabel("Deleting lead");
    await fetch(`/api/leads/${leadId}?_method=DELETE`, { method: "POST" });
    router.push("/leads");
  }

  async function sendEmail() {
    if (!email) return;
    setNotice("");
    setLoadingLabel("Sending email");
    const formData = new FormData();
    formData.append("leadIds", JSON.stringify([leadId]));
    formData.append("subject", emailSubject);
    formData.append("body", emailBody);
    attachments.forEach((file) => formData.append("attachments", file));
    const response = await fetch("/api/leads/send-email", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    setLoadingLabel("");

    if (response.ok) {
      setNoticeType("success");
      setNotice("Email sent.");
      setShowEmailModal(false);
      setAttachments([]);
      return;
    }

    const firstDetailError = Array.isArray(payload.error?.details)
      ? payload.error.details.find((detail: { error?: string }) => detail.error)?.error
      : undefined;
    setNoticeType("error");
    setNotice(firstDetailError || payload.error?.message || "Unable to send email.");
  }

  function resetEmailTemplate() {
    setEmailSubject(emailSubjectTemplate);
    setEmailBody(emailBodyTemplate);
  }

  function insertBusinessNamePlaceholder() {
    const textarea = emailBodyTextareaRef.current;
    if (!textarea) {
      setEmailBody((current) => `${current}${current ? " " : ""}${businessNamePlaceholder}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextBody = `${emailBody.slice(0, start)}${businessNamePlaceholder}${emailBody.slice(end)}`;
    setEmailBody(nextBody);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursorPosition = start + businessNamePlaceholder.length;
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
  }

  function addAttachments(files: FileList | null) {
    if (!files) return;
    const selectedFiles = Array.from(files);
    setAttachments((current) => [...current, ...selectedFiles].slice(0, 5));
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
      <div className="detail-header-actions">
      {loadingLabel ? <LoadingModal label={loadingLabel} /> : null}
      {showEmailModal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="detail-email-compose-title"
          onClick={() => {
            if (!loadingLabel) setShowEmailModal(false);
          }}
        >
          <div className="compose-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-scroll">
              <div className="compose-modal-header">
                <h2 id="detail-email-compose-title">Email lead</h2>
                <button type="button" className="icon-button" aria-label="Close email modal" onClick={() => setShowEmailModal(false)} disabled={Boolean(loadingLabel)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="compose-modal-body">
                <div className="compose-recipients">
                  <span>Recipients</span>
                  <div className="recipient-pills">
                    <span className="recipient-pill">{businessName}</span>
                  </div>
                </div>
                <label>
                  Subject
                  <input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} />
                </label>
                <label>
                  Body
                  <textarea ref={emailBodyTextareaRef} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} rows={10} />
                </label>
                <div className="settings-template-helper">
                  <button type="button" className="secondary compact-button" onClick={insertBusinessNamePlaceholder} disabled={Boolean(loadingLabel)}>
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    Add [business_name]
                  </button>
                </div>
                <div className="field-group">
                  <span>Attachments</span>
                  <input
                    id={attachmentInputId}
                    className="file-upload-input"
                    type="file"
                    multiple
                    onChange={(event) => {
                      addAttachments(event.target.files);
                      event.currentTarget.value = "";
                    }}
                    disabled={Boolean(loadingLabel)}
                  />
                  <label className="file-upload-control" htmlFor={attachmentInputId}>
                    <span className="button secondary compact-button">
                      <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      Choose files
                    </span>
                  </label>
                  <span className="field-note">Up to 5 files, 10MB max each.</span>
                </div>
                {attachments.length > 0 ? (
                  <div className="attachment-list">
                    {attachments.map((file, index) => (
                      <span className="attachment-pill" key={`${file.name}-${file.size}-${index}`}>
                        {file.name}
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeAttachment(index)} disabled={Boolean(loadingLabel)}>
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="compose-modal-actions">
                <button type="button" className="secondary" onClick={resetEmailTemplate} disabled={Boolean(loadingLabel)}>
                  <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <path d="M3 4v5h5" />
                  </svg>
                  Reset
                </button>
                <div className="compose-modal-action-group">
                  <button type="button" className="secondary" onClick={() => setShowEmailModal(false)} disabled={Boolean(loadingLabel)}>Cancel</button>
                  <button type="button" onClick={sendEmail} disabled={Boolean(loadingLabel) || !emailSubject.trim() || !emailBody.trim()}>
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                    Send Email
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="detail-actions-right">
        <button className="danger delete-button" type="button" onClick={deleteLead} disabled={Boolean(loadingLabel)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 16h10l1-16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Delete Lead
        </button>
        {!hasEmail ? (
          <button className="secondary" type="button" onClick={findEmail} disabled={Boolean(loadingLabel)}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Find Email
          </button>
        ) : (
          <button type="button" onClick={() => setShowEmailModal(true)} disabled={Boolean(loadingLabel)}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5Z" />
              <path d="m15 5 4 4" />
            </svg>
            Compose Email
          </button>
        )}
      </div>
    </div>
  );
}
