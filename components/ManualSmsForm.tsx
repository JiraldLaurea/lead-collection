"use client";

import { useEffect, useId, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { importCsvRecipientsWithNames } from "@/lib/csv-recipient-import";
import { MAX_MANUAL_SMS_RECIPIENTS } from "@/lib/manual-sms";

type Props = { defaultBody: string };
type ProgressEvent = {
  completed: number;
  total: number;
  sent: number;
  failed: number;
  /** Total successful provider submissions in this batch, including a previous interrupted attempt. */
  alreadySent?: number;
  /** Recipients the server refused to message (opted out, invalid, duplicate). */
  suppressed?: number;
  error?: string;
};
type ManualSmsRecipient = { name?: string; phone: string };

export function ManualSmsForm({ defaultBody }: Props) {
  const csvInputId = useId();
  const [recipientsText, setRecipientsText] = useState("");
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, sent: 0, failed: 0, alreadySent: 0 });
  const [alreadySent, setAlreadySent] = useState(0);
  const [suppressedCount, setSuppressedCount] = useState(0);
  const [serverSendableCount, setServerSendableCount] = useState<number | null>(null);
  const [checkingRecipients, setCheckingRecipients] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const parsedRecipients = parseRecipients(recipientsText);
  const validCount = parsedRecipients.valid.length;
  const invalidCount = parsedRecipients.invalid.length;
  const sendableCount = serverSendableCount ?? validCount;
  const noFreshRecipients = validCount > 0 && !checkingRecipients && serverSendableCount === 0;
  const exceedsBatchLimit = validCount > MAX_MANUAL_SMS_RECIPIENTS;

  function resetRecipientCheck() {
    setAlreadySent(0);
    setSuppressedCount(0);
    setServerSendableCount(null);
    setCheckingRecipients(true);
  }

  useEffect(() => {
    if (validCount === 0) {
      setCheckingRecipients(false);
      setServerSendableCount(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void (async () => {
        setCheckingRecipients(true);
        try {
          const response = await fetch("/api/manual-sms/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipients: parsedRecipients.valid }),
            signal: controller.signal
          });
          if (!response.ok) return;
          const payload = await response.json() as { data?: { sendableCount?: number; alreadySentCount?: number; suppressedCount?: number } };
          if (controller.signal.aborted || !payload.data) return;
          setServerSendableCount(payload.data.sendableCount ?? validCount);
          setAlreadySent(payload.data.alreadySentCount ?? 0);
          setSuppressedCount(payload.data.suppressedCount ?? 0);
        } catch (error) {
          if ((error as Error).name !== "AbortError") setServerSendableCount(null);
        } finally {
          if (!controller.signal.aborted) setCheckingRecipients(false);
        }
      })();
    }, 300);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [recipientsText, validCount]);

  async function importRecipients(file: File | null) {
    if (!file) return;
    const { recipients, error } = importCsvRecipientsWithNames(
      await file.text(),
      ["phone", "phone_number", "phonenumber", "mobile", "mobile_number"]
    );
    if (error) {
      setNoticeType("error");
      setNotice(error);
      return;
    }
    const recipientLines = recipients.map((recipient) => recipient.name ? `${recipient.name}, ${recipient.value}` : recipient.value);
    setRecipientsText((current) => Array.from(new Set([...current.split(/\r?\n/).filter(Boolean), ...recipientLines])).join("\n"));
    resetRecipientCheck();
    setNoticeType("success");
    const namedCount = recipients.filter((recipient) => recipient.name).length;
    setNotice(`Imported ${recipients.length} phone number${recipients.length === 1 ? "" : "s"}${namedCount ? `; ${namedCount} with business name${namedCount === 1 ? "" : "s"}` : ""}.`);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (!parsedRecipients.valid.length) {
      setNoticeType("error");
      setNotice("Enter at least one Philippine mobile number.");
      return;
    }

    setSending(true);
    setNotice("");
    setProgress({ completed: 0, total: parsedRecipients.valid.length, sent: 0, failed: 0, alreadySent: 0 });
    const batch = getSmsBatch(parsedRecipients.valid, body);

    try {
      const response = await fetch("/api/manual-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsedRecipients.valid, body, batchKey: batch.batchKey })
      });
      if (!response.ok) {
        const rawBody = await response.text();
        let message = "Unable to send SMS.";
        if (rawBody) {
          try {
            const payload = JSON.parse(rawBody) as { error?: { message?: string } };
            message = payload.error?.message || message;
          } catch {
            message = rawBody.slice(0, 240);
          }
        }
        throw new Error(message);
      }
      if (!response.body) throw new Error("SMS progress stream is unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sent = 0;
      let failed = 0;
      let submitted = 0;
      let suppressed = 0;
      let firstFailure = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const progressEvent = JSON.parse(line) as ProgressEvent;
          setProgress({ ...progressEvent, alreadySent: progressEvent.alreadySent ?? progressEvent.sent });
          sent = progressEvent.sent;
          failed = progressEvent.failed;
          submitted = progressEvent.alreadySent ?? progressEvent.sent;
          suppressed = progressEvent.suppressed ?? 0;
          setAlreadySent(submitted);
          setSuppressedCount(suppressed);
          setServerSendableCount(Math.max(0, validCount - submitted - suppressed));
          if (progressEvent.error && !firstFailure) firstFailure = progressEvent.error;
        }
        if (done) break;
      }

      if (!submitted) throw new Error(firstFailure || "SMS sending failed.");
      setNoticeType("success");
      setNotice(
        `${sent ? `Submitted ${sent} new SMS message${sent === 1 ? "" : "s"}` : "No new SMS was submitted"}${
          submitted > sent ? `; ${submitted - sent} already sent and skipped` : ""
        }${failed ? `; ${failed} failed and can be retried` : ""}${
          suppressed ? `; ${suppressed} skipped (opted out, duplicate or invalid)` : ""
        }${invalidCount ? `; ${invalidCount} invalid number${invalidCount === 1 ? "" : "s"} skipped` : ""}.`
      );
    } catch (error) {
      setNoticeType("error");
      setNotice(error instanceof Error ? error.message : "Unable to send SMS.");
    } finally {
      setSending(false);
      setProgress({ completed: 0, total: 0, sent: 0, failed: 0, alreadySent: 0 });
    }
  }

  return (
    <form className="panel manual-email-card manual-compose-card" onSubmit={submit}>
      {sending ? <LoadingModal label="Sending SMS" message={`${progress.alreadySent}/${progress.total} SMS submitted${progress.failed ? ` · ${progress.failed} failed` : ""}`} /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="manual-email-body manual-compose-body">
        <label>
          <span className="field-label-row">
            <span>Recipients</span>
            <span className="recipient-counts">
              <span className="recipient-count recipient-count-valid">
                {checkingRecipients ? "Checking recipients…" : `${sendableCount} valid recipient${sendableCount === 1 ? "" : "s"}`}
              </span>
              {alreadySent > 0 ? (
                <span className="recipient-count recipient-count-sent">{alreadySent} already sent</span>
              ) : null}
              {invalidCount > 0 ? (
                <span className="recipient-count recipient-count-invalid">{invalidCount} invalid</span>
              ) : null}
            </span>
          </span>
          <textarea
            value={recipientsText}
            onChange={(event) => { resetRecipientCheck(); setRecipientsText(event.target.value); }}
            rows={5}
            placeholder={"09614073159\nJirald Sample Cafe, 09614073159"}
            disabled={sending}
          />
          <span className="field-note">
            One recipient per line. Use either <code>phone</code> or <code>name, phone</code>. Up to {MAX_MANUAL_SMS_RECIPIENTS.toLocaleString()} valid recipients per send.
          </span>
        </label>
        <div className="manual-csv-import">
          <input id={csvInputId} className="file-upload-input" type="file" accept=".csv,text/csv" onChange={(event) => { void importRecipients(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} disabled={sending} />
          <label className="button secondary compact-button" htmlFor={csvInputId}>Import CSV</label>
          <span className="field-note">Imports <code>phone</code> and, when present, <code>business_name</code> from an SME Search CSV export.</span>
        </div>
        <label>
          Message
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} maxLength={1000} disabled={sending} />
          <span className="field-note">Use <code>[business_name]</code> to personalize each message. {body.length}/1000 characters.</span>
        </label>
      </div>
      <div className="manual-email-footer">
        <div className="manual-compose-footer-actions">
          <button type="button" className="secondary" onClick={() => setBody(defaultBody)} disabled={sending}>Reset message</button>
        </div>
        <button type="submit" disabled={sending || checkingRecipients || !recipientsText.trim() || !body.trim() || noFreshRecipients || exceedsBatchLimit}>
          {exceedsBatchLimit
            ? `Maximum ${MAX_MANUAL_SMS_RECIPIENTS.toLocaleString()} recipients`
            : noFreshRecipients ? "All recipients already sent" : `Send SMS${sendableCount > 0 ? ` (${sendableCount})` : ""}`}
        </button>
      </div>
    </form>
  );
}

function getSmsBatch(recipients: ManualSmsRecipient[], body: string) {
  // The same normalized recipient set and message resolve to the same persisted checkpoint,
  // including after a refresh. Editing either starts a deliberate new batch.
  const fingerprint = JSON.stringify({
    body: body.trim(),
    recipients: recipients
      .map((recipient) => ({ name: recipient.name?.trim() || "", phone: recipient.phone.replace(/\D/g, "") }))
      .sort((left, right) => `${left.phone}:${left.name}`.localeCompare(`${right.phone}:${right.name}`))
  });
  const storageKey = `qroad.manual-sms.batch.${hashFingerprint(fingerprint)}`;
  const stored = window.localStorage.getItem(storageKey);

  if (stored) {
    try {
      const parsed = JSON.parse(stored) as { batchKey?: string; fingerprint?: string };
      if (parsed.batchKey && parsed.fingerprint === fingerprint) return { batchKey: parsed.batchKey, storageKey };
    } catch {
      // Replace stale or malformed browser storage below.
    }
  }

  const batchKey = crypto.randomUUID();
  window.localStorage.setItem(storageKey, JSON.stringify({ batchKey, fingerprint }));
  return { batchKey, storageKey };
}

function hashFingerprint(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function parseRecipients(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const recipients = lines.map(parseRecipientLine);
  const unique = Array.from(new Map(recipients.map((recipient) => [recipient.phone, recipient])).values());

  return {
    valid: unique.filter((recipient) => isValidPhilippineMobileNumber(recipient.phone)),
    invalid: unique.filter((recipient) => !isValidPhilippineMobileNumber(recipient.phone)).map((recipient) => recipient.phone)
  };
}

function parseRecipientLine(line: string): ManualSmsRecipient {
  const parts = line.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) return { name: parts.slice(0, -1).join(", "), phone: parts[parts.length - 1] };
  return { phone: line };
}

function isValidPhilippineMobileNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits) || /^639\d{9}$/.test(digits);
}
