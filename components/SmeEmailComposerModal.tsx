"use client";

import { useRef, useState } from "react";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";

type Recipient = { id: number; businessName: string };

export function SmeEmailComposerModal({
  recipients,
  initialBody,
  onClose,
  onSent
}: {
  recipients: Recipient[];
  initialBody: string;
  onClose: () => void;
  onSent: (sent: number, failed: number) => void;
}) {
  const [subject, setSubject] = useState(emailSubjectTemplate);
  const [body, setBody] = useState(initialBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertPlaceholder() {
    const placeholder = "[business_name]";
    const textarea = bodyRef.current;
    if (!textarea) return setBody((current) => `${current}${current ? " " : ""}${placeholder}`);
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setBody(`${body.slice(0, start)}${placeholder}${body.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  async function send() {
    if (sending || !subject.trim() || !body.trim()) return;
    setSending(true);
    setError("");
    const response = await fetch("/api/leads/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: recipients.map((recipient) => recipient.id), subject, body })
    });
    const payload = await response.json();
    setSending(false);
    if (response.ok) return onSent(payload.data.sent, payload.data.failed);
    setError(payload.error?.message || "Unable to send the selected emails.");
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !sending && onClose()}>
      <div className="compose-modal" role="dialog" aria-modal="true" aria-labelledby="sme-email-title" onClick={(event) => event.stopPropagation()}>
        <div className="compose-modal-scroll">
          <div className="compose-modal-header">
            <ModalHeaderText id="sme-email-title" title="Compose Email" subtitle="Only selected businesses with a saved email address will receive this message." />
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={sending}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
          <div className="compose-modal-body">
            {error ? <p className="sme-send-error">{error}</p> : null}
            <div className="compose-recipients"><span>Recipients</span><div className="recipient-pills">{recipients.map((recipient) => <span className="recipient-pill" key={recipient.id}>{recipient.businessName}</span>)}</div></div>
            <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={sending} maxLength={160} /></label>
            <label>Message<textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} rows={10} disabled={sending} maxLength={5000} /></label>
            <div className="settings-template-helper"><button type="button" className="secondary compact-button" onClick={insertPlaceholder} disabled={sending}>Add [business_name]</button></div>
          </div>
          <div className="compose-modal-actions"><span /><div className="compose-modal-action-group"><button type="button" className="secondary" onClick={onClose} disabled={sending}>Cancel</button><button type="button" onClick={send} disabled={sending || !subject.trim() || !body.trim()}>{sending ? "Sending…" : `Send Email to ${recipients.length}`}</button></div></div>
        </div>
      </div>
    </div>
  );
}
