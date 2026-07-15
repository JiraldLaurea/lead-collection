"use client";

import { useId, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { importCsvRecipientColumn } from "@/lib/csv-recipient-import";

type Props = { defaultBody: string };
type ProgressEvent = {
  completed: number;
  total: number;
  sent: number;
  failed: number;
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
  const [progress, setProgress] = useState({ completed: 0, total: 0, sent: 0, failed: 0 });
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const parsedRecipients = parseRecipients(recipientsText);

  async function importRecipients(file: File | null) {
    if (!file) return;
    const { values, error } = importCsvRecipientColumn(await file.text(), ["phone", "phone_number", "phonenumber", "mobile", "mobile_number"]);
    if (error) {
      setNoticeType("error");
      setNotice(error);
      return;
    }
    setRecipientsText((current) => Array.from(new Set([...current.split(/\r?\n/).filter(Boolean), ...values])).join("\n"));
    setNoticeType("success");
    setNotice(`Imported ${values.length} phone number${values.length === 1 ? "" : "s"}.`);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (parsedRecipients.invalid.length) {
      setNoticeType("error");
      setNotice(`Invalid Philippine mobile number${parsedRecipients.invalid.length === 1 ? "" : "s"}: ${parsedRecipients.invalid.slice(0, 3).join(", ")}`);
      return;
    }
    if (!parsedRecipients.valid.length) {
      setNoticeType("error");
      setNotice("Enter at least one Philippine mobile number.");
      return;
    }

    setSending(true);
    setNotice("");
    setProgress({ completed: 0, total: parsedRecipients.valid.length, sent: 0, failed: 0 });

    try {
      const response = await fetch("/api/manual-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsedRecipients.valid, body })
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message || "Unable to send SMS.");
      }
      if (!response.body) throw new Error("SMS progress stream is unavailable.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sent = 0;
      let failed = 0;
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
          setProgress(progressEvent);
          sent = progressEvent.sent;
          failed = progressEvent.failed;
          suppressed = progressEvent.suppressed ?? 0;
          if (progressEvent.error && !firstFailure) firstFailure = progressEvent.error;
        }
        if (done) break;
      }
      if (!sent) throw new Error(firstFailure || "SMS sending failed.");
      setNoticeType("success");
      setNotice(
        `Sent ${sent} SMS message${sent === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}${
          // The user typed these numbers, so silently dropping them would be worse than saying so.
          suppressed ? `; ${suppressed} skipped (opted out, duplicate or invalid)` : ""
        }.`
      );
      setRecipientsText("");
    } catch (error) {
      setNoticeType("error");
      setNotice(error instanceof Error ? error.message : "Unable to send SMS.");
    } finally {
      setSending(false);
      setProgress({ completed: 0, total: 0, sent: 0, failed: 0 });
    }
  }

  return (
    <form className="panel manual-email-card manual-compose-card" onSubmit={submit}>
      {sending ? <LoadingModal label="Sending SMS" message={`${progress.sent}/${progress.total} SMS sent${progress.failed ? ` · ${progress.completed}/${progress.total} processed` : ""}`} /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="manual-email-body manual-compose-body">
        <label>
          Recipients
          <textarea
            value={recipientsText}
            onChange={(event) => setRecipientsText(event.target.value)}
            rows={5}
            placeholder={"09614073159\nJirald Sample Cafe, 09614073159"}
            disabled={sending}
          />
          <span className="field-note">
            One recipient per line. Use either <code>phone</code> or <code>name, phone</code>. {parsedRecipients.valid.length} valid recipient{parsedRecipients.valid.length === 1 ? "" : "s"}.
          </span>
        </label>
        <div className="manual-csv-import">
          <input id={csvInputId} className="file-upload-input" type="file" accept=".csv,text/csv" onChange={(event) => { void importRecipients(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} disabled={sending} />
          <label className="button secondary compact-button" htmlFor={csvInputId}>Import CSV</label>
          <span className="field-note">Imports values from the <code>phone</code> column in an SME Search CSV export.</span>
        </div>
        <label>
          Message
          <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} maxLength={1000} disabled={sending} />
          <span className="field-note">Use <code>[business_name]</code> to personalize each message. {body.length}/1000 characters.</span>
        </label>
      </div>
      <div className="manual-email-footer">
        <button type="button" className="secondary" onClick={() => setBody(defaultBody)} disabled={sending}>Reset message</button>
        <button type="submit" disabled={sending || !recipientsText.trim() || !body.trim()}>Send SMS</button>
      </div>
    </form>
  );
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
  if (parts.length >= 2) {
    return { name: parts.slice(0, -1).join(", "), phone: parts[parts.length - 1] };
  }
  return { phone: line };
}

function isValidPhilippineMobileNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits) || /^639\d{9}$/.test(digits);
}
