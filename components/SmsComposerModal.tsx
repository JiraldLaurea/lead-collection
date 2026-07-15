"use client";

import { useEffect, useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { measureSms } from "@/lib/sms-length";
// Imported from the client-safe module: lib/sme/suppression.ts pulls in Prisma, which would
// otherwise be bundled into the browser.
import {
  exclusionLabels,
  type ExcludedRecipient,
  type ScreeningSummary
} from "@/lib/sme/suppression-labels";

type Screening = {
  summary: ScreeningSummary;
  sendable: { id: number; businessName: string; phone: string }[];
  excluded: ExcludedRecipient[];
};

type SmsComposerModalProps = {
  providerPlaceIds: string[];
  initialBody: string;
  onClose: () => void;
  onSent: (sent: number, failed: number) => void;
};

const businessNamePlaceholder = "[business_name]";

/**
 * The SMS composer. Posts to the existing /api/leads/send-sms route, so there is one SMS
 * provider integration and one send history — SME Search and the Leads table both go through
 * it. Nothing is ever sent without the user confirming the final recipient list.
 */
export function SmsComposerModal({ providerPlaceIds, initialBody, onClose, onSent }: SmsComposerModalProps) {
  const [body, setBody] = useState(initialBody);
  const [screening, setScreening] = useState<Screening | null>(null);
  const [removed, setRemoved] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function screen() {
      setLoading(true);
      const response = await fetch("/api/sme-search/sms-screening", {
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

    screen();
    return () => {
      cancelled = true;
    };
  }, [providerPlaceIds]);

  const finalRecipients = (screening?.sendable ?? []).filter((recipient) => !removed.includes(recipient.id));
  const preview = body.split(businessNamePlaceholder).join(finalRecipients[0]?.businessName ?? "Business Name");
  const length = measureSms(preview);

  function insertPlaceholder() {
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
      const next = start + businessNamePlaceholder.length;
      textarea.setSelectionRange(next, next);
    });
  }

  async function send() {
    if (finalRecipients.length === 0 || sending) return;
    setSending(true);
    setError("");

    const response = await fetch("/api/sme-search/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessIds: finalRecipients.map((recipient) => recipient.id), body })
    });
    const payload = await response.json();
    setSending(false);

    if (response.ok) {
      onSent(payload.data.sent, payload.data.failed);
      return;
    }
    setError(payload.error?.message || "Unable to send the SMS messages.");
  }

  const summary = screening?.summary;

  return (
    <div className="modal-backdrop" role="presentation" onClick={() => !sending && onClose()}>
      {sending ? <LoadingModal label="Sending SMS" /> : null}
      <div
        className="compose-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sme-sms-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="compose-modal-scroll">
          <div className="compose-modal-header">
            <ModalHeaderText
              id="sme-sms-title"
              title="Send SMS"
              subtitle="Review the recipient list, then confirm. Nothing is sent until you press Send."
            />
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={sending}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div className="compose-modal-body">
            {loading ? <p className="muted">Checking the recipient list…</p> : null}
            {error ? <p className="sme-send-error">{error}</p> : null}

            {summary ? (
              <div className="sme-summary">
                <span className="sme-summary-chip">
                  <strong>{summary.selected}</strong> selected
                </span>
                <span className="sme-summary-chip">
                  <strong>{finalRecipients.length}</strong> will receive
                </span>
                {summary.missingPhone > 0 ? (
                  <span className="sme-summary-chip">
                    <strong>{summary.missingPhone}</strong> no phone
                  </span>
                ) : null}
                {summary.invalidNumber > 0 ? (
                  <span className="sme-summary-chip">
                    <strong>{summary.invalidNumber}</strong> invalid
                  </span>
                ) : null}
                {summary.requiresReview > 0 ? (
                  <span className="sme-summary-chip">
                    <strong>{summary.requiresReview}</strong> need review
                  </span>
                ) : null}
                {summary.duplicate > 0 ? (
                  <span className="sme-summary-chip">
                    <strong>{summary.duplicate}</strong> duplicate
                  </span>
                ) : null}
                {summary.doNotContact > 0 ? (
                  <span className="sme-summary-chip">
                    <strong>{summary.doNotContact}</strong> do not contact
                  </span>
                ) : null}
                {summary.previouslyFailed > 0 ? (
                  <span className="sme-summary-chip">
                    <strong>{summary.previouslyFailed}</strong> previously failed
                  </span>
                ) : null}
              </div>
            ) : null}

            {finalRecipients.length > 0 ? (
              <div className="compose-recipients">
                <span>Recipients</span>
                <div className="recipient-pills">
                  {finalRecipients.map((recipient) => (
                    <span className="recipient-pill" key={recipient.id}>
                      {recipient.businessName}
                      <button
                        type="button"
                        aria-label={`Remove ${recipient.businessName}`}
                        onClick={() => setRemoved((current) => [...current, recipient.id])}
                        disabled={sending}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M18 6 6 18" />
                          <path d="m6 6 12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {screening && screening.excluded.length > 0 ? (
              <div className="field-group">
                <span>Excluded before sending</span>
                <ul className="sme-reason-list">
                  {screening.excluded.map((item) => (
                    <li key={`${item.id}-${item.reason}`}>
                      <code>{exclusionLabels[item.reason]}</code>
                      <p>{item.businessName}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <label>
              Message
              <textarea
                ref={textareaRef}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={6}
                maxLength={1000}
                disabled={sending}
              />
            </label>
            <div className="settings-template-helper">
              <button type="button" className="secondary compact-button" onClick={insertPlaceholder} disabled={sending}>
                Add [business_name]
              </button>
              <span className="field-note">
                {length.characters} characters · {length.segments} segment
                {length.segments === 1 ? "" : "s"} · {length.encoding}
              </span>
            </div>
          </div>

          <div className="compose-modal-actions">
            <span />
            <div className="compose-modal-action-group">
              <button type="button" className="secondary" onClick={onClose} disabled={sending}>
                Cancel
              </button>
              <button
                type="button"
                onClick={send}
                disabled={sending || loading || finalRecipients.length === 0 || !body.trim()}
              >
                {sending
                  ? "Sending…"
                  : `Send SMS to ${finalRecipients.length} recipient${finalRecipients.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
