"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import type { EmailRecipientScreening } from "@/lib/email-suppression";

type Screening = Pick<EmailRecipientScreening, "summary" | "excluded"> & {
  sendable: { id: number; businessName: string; email: string }[];
};

export function SmeEmailComposerModal({
  providerPlaceIds,
  initialBody,
  onClose,
  onSent
}: {
  providerPlaceIds: string[];
  initialBody: string;
  onClose: () => void;
  onSent: (sent: number, failed: number) => void;
}) {
  const [subject, setSubject] = useState(emailSubjectTemplate);
  const [body, setBody] = useState(initialBody);
  const [screening, setScreening] = useState<Screening | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function screen() {
      setLoading(true);
      const response = await fetch("/api/sme-search/email-screening", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerPlaceIds })
      });
      const payload = await response.json();
      if (cancelled) return;
      if (response.ok) setScreening(payload.data);
      else setError(payload.error?.message || "Unable to check the recipient list.");
      setLoading(false);
    }

    void screen();
    return () => {
      cancelled = true;
    };
  }, [providerPlaceIds]);

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
    if (sending || !subject.trim() || !body.trim() || !screening?.sendable.length) return;
    setSending(true);
    setError("");
    const response = await fetch("/api/sme-search/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessIds: screening.sendable.map((recipient) => recipient.id), subject, body })
    });
    const payload = await response.json();
    setSending(false);
    if (response.ok) return onSent(payload.data.sent, payload.data.failed);
    setError(payload.error?.message || "Unable to send the selected emails.");
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !sending && onClose()}>
      {sending ? <LoadingModal label="Sending email" /> : null}
      <div className="compose-modal" role="dialog" aria-modal="true" aria-labelledby="sme-email-title" onClick={(event) => event.stopPropagation()}>
        <div className="compose-modal-scroll">
          <div className="compose-modal-header">
            <ModalHeaderText id="sme-email-title" title="Compose Email" subtitle="Review the recipient list, then confirm. Nothing is sent until you press Send." />
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={sending}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
          <div className="compose-modal-body">
            {error ? <p className="sme-send-error">{error}</p> : null}
            {loading ? <p className="muted">Checking the recipient list…</p> : null}
            {screening ? (
              <div className="sme-summary">
                <span className="sme-summary-chip"><strong>{screening.summary.selected}</strong> selected</span>
                <span className="sme-summary-chip"><strong>{screening.sendable.length}</strong> will receive</span>
                {screening.summary.missingEmail > 0 ? <span className="sme-summary-chip"><strong>{screening.summary.missingEmail}</strong> no email</span> : null}
                {screening.summary.invalidEmail > 0 ? <span className="sme-summary-chip"><strong>{screening.summary.invalidEmail}</strong> invalid</span> : null}
                {screening.summary.duplicate > 0 ? <span className="sme-summary-chip"><strong>{screening.summary.duplicate}</strong> duplicate</span> : null}
                {screening.summary.doNotContact > 0 ? <span className="sme-summary-chip"><strong>{screening.summary.doNotContact}</strong> do not contact</span> : null}
              </div>
            ) : null}
            {screening?.sendable.length ? (
              <div className="compose-recipients"><span>Recipients</span><div className="recipient-pills">{screening.sendable.slice(0, 5).map((recipient) => <span className="recipient-pill" key={recipient.id}>{recipient.businessName}</span>)}{screening.sendable.length > 5 ? <span className="recipient-pill recipient-pill-more">+{screening.sendable.length - 5} more</span> : null}</div></div>
            ) : null}
            {screening?.excluded.length ? (
              <div className="field-group"><span>Excluded before sending</span><ul className="sme-reason-list">{screening.excluded.map((recipient) => <li key={`${recipient.id}-${recipient.reason}`}><code>{recipient.reason.replaceAll("_", " ")}</code><p>{recipient.businessName}</p></li>)}</ul></div>
            ) : null}
            <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={sending} maxLength={160} /></label>
            <label>Message<textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} rows={10} disabled={sending} maxLength={5000} /></label>
            <div className="settings-template-helper"><button type="button" className="secondary compact-button" onClick={insertPlaceholder} disabled={sending}>Add [business_name]</button></div>
          </div>
          <div className="compose-modal-actions"><span /><div className="compose-modal-action-group"><button type="button" className="secondary" onClick={onClose} disabled={sending}>Cancel</button><button type="button" onClick={send} disabled={sending || loading || !subject.trim() || !body.trim() || !screening?.sendable.length}>{sending ? "Sending…" : `Send Email to ${screening?.sendable.length ?? 0}`}</button></div></div>
        </div>
      </div>
    </div>
  );
}
