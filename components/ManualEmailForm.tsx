"use client";

import { useId, useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { importCsvRecipientColumn } from "@/lib/csv-recipient-import";

type Props = { defaultSubject: string; defaultBody: string };
type ProgressEvent = { completed: number; total: number; sent: number; failed: number; error?: string };

export function ManualEmailForm({ defaultSubject, defaultBody }: Props) {
  const attachmentInputId = useId();
  const csvInputId = useId();
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [recipientsText, setRecipientsText] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0, sent: 0, failed: 0 });
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const parsedRecipients = parseRecipients(recipientsText);

  async function importRecipients(file: File | null) {
    if (!file) return;
    const { values, error } = importCsvRecipientColumn(await file.text(), ["email", "email_address", "emailaddress"]);
    if (error) {
      setNoticeType("error");
      setNotice(error);
      return;
    }
    setRecipientsText((current) => Array.from(new Set([...current.split(/[\s,;]+/).filter(Boolean), ...values])).join("\n"));
    setNoticeType("success");
    setNotice(`Imported ${values.length} email address${values.length === 1 ? "" : "es"}.`);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    if (parsedRecipients.invalid.length) {
      setNoticeType("error");
      setNotice(`Invalid email address${parsedRecipients.invalid.length === 1 ? "" : "es"}: ${parsedRecipients.invalid.slice(0, 3).join(", ")}`);
      return;
    }
    if (!parsedRecipients.valid.length) {
      setNoticeType("error");
      setNotice("Enter at least one recipient email address.");
      return;
    }

    setSending(true);
    setNotice("");
    setProgress({ completed: 0, total: parsedRecipients.valid.length, sent: 0, failed: 0 });
    const formData = new FormData();
    formData.append("recipients", JSON.stringify(parsedRecipients.valid));
    formData.append("subject", subject);
    formData.append("body", body);
    attachments.forEach((file) => formData.append("attachments", file));

    try {
      const response = await fetch("/api/manual-email", { method: "POST", body: formData });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error?.message || "Unable to send emails.");
      }
      if (!response.body) throw new Error("Email progress stream is unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sent = 0;
      let failed = 0;
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
          if (progressEvent.error && !firstFailure) firstFailure = progressEvent.error;
        }
        if (done) break;
      }
      if (!sent) throw new Error(firstFailure || "Email sending failed.");
      setNoticeType("success");
      setNotice(`Sent ${sent} email${sent === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}.`);
      setRecipientsText("");
      setAttachments([]);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    } catch (error) {
      setNoticeType("error");
      setNotice(error instanceof Error ? error.message : "Unable to send emails.");
    } finally {
      setSending(false);
      setProgress({ completed: 0, total: 0, sent: 0, failed: 0 });
    }
  }

  return (
    <form className="panel manual-email-card manual-compose-card" onSubmit={submit}>
      {sending ? <LoadingModal label="Sending emails" message={`${progress.sent}/${progress.total} emails sent${progress.failed ? ` · ${progress.completed}/${progress.total} processed` : ""}`} /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="manual-email-body manual-compose-body">
        <label>
          Recipients
          <textarea value={recipientsText} onChange={(event) => setRecipientsText(event.target.value)} rows={5} placeholder="name@example.com, another@example.com" disabled={sending} />
          <span className="field-note">Separate addresses with commas, semicolons, spaces, or new lines. {parsedRecipients.valid.length} valid recipient{parsedRecipients.valid.length === 1 ? "" : "s"}.</span>
        </label>
        <div className="manual-csv-import">
          <input id={csvInputId} className="file-upload-input" type="file" accept=".csv,text/csv" onChange={(event) => { void importRecipients(event.target.files?.[0] ?? null); event.currentTarget.value = ""; }} disabled={sending} />
          <label className="button secondary compact-button" htmlFor={csvInputId}>Import CSV</label>
          <span className="field-note">Imports values from an <code>email</code> column, including exported SME CSV files with email data.</span>
        </div>
        <label>Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={160} disabled={sending} /></label>
        <label>Body<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={10} maxLength={5000} disabled={sending} /></label>
        <div className="field-group">
          <span>Attachments</span>
          <input ref={attachmentInputRef} id={attachmentInputId} className="file-upload-input" type="file" multiple onChange={(event) => setAttachments(Array.from(event.target.files || []).slice(0, 5))} disabled={sending} />
          <label className="button secondary compact-button" htmlFor={attachmentInputId}>Choose files</label>
          <span className="field-note">Up to 5 files, 10MB each. The default template attachment is included automatically.</span>
        </div>
        {attachments.length ? <div className="attachment-list">{attachments.map((file, index) => <span className="attachment-pill" key={`${file.name}-${file.size}-${index}`}>{file.name}<button type="button" aria-label={`Remove ${file.name}`} onClick={() => setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button></span>)}</div> : null}
      </div>
      <div className="manual-email-footer">
        <button type="button" className="secondary" onClick={() => { setSubject(defaultSubject); setBody(defaultBody); }} disabled={sending}>Reset message</button>
        <button type="submit" disabled={sending || !recipientsText.trim() || !subject.trim() || !body.trim()}>Send Email</button>
      </div>
    </form>
  );
}

function parseRecipients(value: string) {
  const candidates = value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);
  const unique = Array.from(new Set(candidates.map((item) => item.toLowerCase())));
  return {
    valid: unique.filter((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)),
    invalid: unique.filter((item) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item))
  };
}
