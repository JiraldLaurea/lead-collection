"use client";

import Checkbox from "@mui/material/Checkbox";
import { useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { defaultSmsBodyTemplate } from "@/lib/sms-template-defaults";

export type CsvLeadRow = {
  id: number;
  clientId: string | null;
  businessName: string;
  industry: string | null;
  cityArea: string | null;
  priority: string | null;
  contactName: string | null;
  phoneNumber: string | null;
  email: string | null;
  socialUrl: string | null;
  status: string | null;
  packageName: string | null;
  import: { fileName: string; importedAt: Date | string };
};

type Props = { leads: CsvLeadRow[]; emailBodyTemplate: string };

type EmailProgressEvent = {
  type: "progress";
  completed: number;
  total: number;
  sent: number;
  failed: number;
  error?: string;
};

export function CsvLeadWorkspace({ leads, emailBodyTemplate }: Props) {
  const router = useRouter();
  const fileInputId = useId();
  const attachmentInputId = useId();
  const emailTextareaRef = useRef<HTMLTextAreaElement>(null);
  const smsTextareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionAnchorIdRef = useRef<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ completed: 0, total: 0, sent: 0, failed: 0 });
  const [sendingSms, setSendingSms] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState(emailSubjectTemplate);
  const [emailBody, setEmailBody] = useState(emailBodyTemplate);
  const [smsBody, setSmsBody] = useState(defaultSmsBodyTemplate);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const selectedLeads = useMemo(() => leads.filter((lead) => selectedIds.includes(lead.id)), [leads, selectedIds]);
  const emailLeads = selectedLeads.filter((lead) => Boolean(lead.email));
  const smsLeads = selectedLeads.filter((lead) => hasValidMobile(lead.phoneNumber));
  const allSelected = leads.length > 0 && selectedIds.length === leads.length;
  const someSelected = selectedIds.length > 0 && !allSelected;

  function showError(message: string) {
    setNoticeType("error");
    setNotice(message);
  }

  async function importCsv() {
    if (!file || importing) return;
    setImporting(true);
    setNotice("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/csv-leads/import", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || "Unable to import CSV.");
      setSelectedIds([]);
      setFile(null);
      setNoticeType("success");
      setNotice(`Imported ${payload.data.imported} lead${payload.data.imported === 1 ? "" : "s"}${payload.data.skipped ? `; skipped ${payload.data.skipped} incomplete row${payload.data.skipped === 1 ? "" : "s"}` : ""}.`);
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to import CSV.");
    } finally {
      setImporting(false);
    }
  }

  async function sendEmails() {
    if (!emailLeads.length || sendingEmail) return;
    setSendingEmail(true);
    setEmailProgress({ completed: 0, total: emailLeads.length, sent: 0, failed: 0 });
    const formData = new FormData();
    formData.append("leadIds", JSON.stringify(emailLeads.map((lead) => lead.id)));
    formData.append("subject", emailSubject);
    formData.append("body", emailBody);
    attachments.forEach((attachment) => formData.append("attachments", attachment));
    try {
      const response = await fetch("/api/csv-leads/send-email", { method: "POST", body: formData });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(firstError(payload) || "Unable to send emails.");
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
          const event = JSON.parse(line) as EmailProgressEvent;
          setEmailProgress({ completed: event.completed, total: event.total, sent: event.sent, failed: event.failed });
          sent = event.sent;
          failed = event.failed;
          if (event.error && !firstFailure) firstFailure = event.error;
        }
        if (done) break;
      }
      if (sent === 0) throw new Error(firstFailure || "Email sending failed.");
      setShowEmailModal(false);
      setAttachments([]);
      setNoticeType("success");
      setNotice(`Sent ${sent} email${sent === 1 ? "" : "s"}${failed ? `; ${failed} failed` : ""}.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to send emails.");
    } finally {
      setSendingEmail(false);
      setEmailProgress({ completed: 0, total: 0, sent: 0, failed: 0 });
    }
  }

  async function sendSmsMessages() {
    if (!smsLeads.length || sendingSms) return;
    setSendingSms(true);
    try {
      const response = await fetch("/api/csv-leads/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: smsLeads.map((lead) => lead.id), body: smsBody })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(firstError(payload) || "Unable to send SMS messages.");
      setShowSmsModal(false);
      setNoticeType("success");
      setNotice(`Sent ${payload.data.sent} SMS message${payload.data.sent === 1 ? "" : "s"}${payload.data.failed ? `; ${payload.data.failed} failed` : ""}.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Unable to send SMS messages.");
    } finally {
      setSendingSms(false);
    }
  }

  function toggle(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function selectLead(id: number, shiftKey = false) {
    const anchorId = selectionAnchorIdRef.current;
    if (shiftKey && anchorId !== null) {
      window.getSelection()?.removeAllRanges();
      const anchorIndex = leads.findIndex((lead) => lead.id === anchorId);
      const selectedIndex = leads.findIndex((lead) => lead.id === id);
      if (anchorIndex >= 0 && selectedIndex >= 0) {
        const start = Math.min(anchorIndex, selectedIndex);
        const end = Math.max(anchorIndex, selectedIndex);
        const rangeIds = leads.slice(start, end + 1).map((lead) => lead.id);
        setSelectedIds((current) => Array.from(new Set([...current, ...rangeIds])));
        selectionAnchorIdRef.current = id;
        return;
      }
    }
    toggle(id);
    selectionAnchorIdRef.current = id;
  }

  function insertPlaceholder(kind: "email" | "sms") {
    const placeholder = "[business_name]";
    const textarea = kind === "email" ? emailTextareaRef.current : smsTextareaRef.current;
    const current = kind === "email" ? emailBody : smsBody;
    const update = kind === "email" ? setEmailBody : setSmsBody;
    if (!textarea) return update(`${current}${current ? " " : ""}${placeholder}`);
    const next = `${current.slice(0, textarea.selectionStart)}${placeholder}${current.slice(textarea.selectionEnd)}`;
    update(next);
    requestAnimationFrame(() => {
      const cursor = textarea.selectionStart + placeholder.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  return (
    <div className="stack">
      {importing ? <LoadingModal label="Importing CSV" /> : null}
      {sendingEmail ? (
        <LoadingModal
          label="Sending emails"
          message={`${emailProgress.sent}/${emailProgress.total} emails sent${emailProgress.failed ? ` · ${emailProgress.completed}/${emailProgress.total} processed` : ""}`}
        />
      ) : null}
      {sendingSms ? <LoadingModal label="Sending SMS" /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}

      <section className="csv-import-panel">
        <div>
          <h2>Import a CSV</h2>
          <p>Headers are detected automatically, including CSVs with title rows above the table.</p>
        </div>
        <input id={fileInputId} className="file-upload-input" type="file" accept=".csv,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <label className="button secondary" htmlFor={fileInputId}>Choose CSV</label>
        <span className="csv-file-name">{file?.name || "No file chosen"}</span>
        <button type="button" disabled={!file || importing} onClick={importCsv}>Import leads</button>
      </section>

      <div className="bulk-actions">
        <div className="bulk-actions-left">
          <button type="button" disabled={!emailLeads.length} onClick={() => setShowEmailModal(true)}>Compose Email ({emailLeads.length})</button>
          <button type="button" className="secondary" disabled={!smsLeads.length} onClick={() => setShowSmsModal(true)}>Send SMS ({smsLeads.length})</button>
        </div>
        <span className="muted">{selectedIds.length} selected · {leads.length} imported</span>
      </div>

      <div className="table-frame">
        <div className="table-scroll leads-table-frame">
          <table className="leads-table csv-leads-table">
            <thead><tr>
              <th
                className="select-cell"
                onClick={(event) => {
                  event.stopPropagation();
                  if (leads.length) {
                    setSelectedIds(allSelected ? [] : leads.map((lead) => lead.id));
                    selectionAnchorIdRef.current = null;
                  }
                }}
              >
                <Checkbox
                  aria-label="Select all imported leads"
                  checked={allSelected}
                  indeterminate={someSelected}
                  disabled={!leads.length}
                  size="small"
                  onChange={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedIds(allSelected ? [] : leads.map((lead) => lead.id));
                    selectionAnchorIdRef.current = null;
                  }}
                />
              </th>
              <th>Client ID</th><th>Business Name</th><th>Industry</th><th>City / Area</th><th>Priority</th><th>Contact</th><th>Phone</th><th>Email</th><th>Status</th><th>Package</th><th>Imported From</th>
            </tr></thead>
            <tbody>{leads.map((lead) => (
              <tr
                key={lead.id}
                className={selectedIds.includes(lead.id) ? "selected-row" : ""}
                onMouseDown={(event) => {
                  if (event.shiftKey) event.preventDefault();
                }}
                onClick={(event) => selectLead(lead.id, event.shiftKey)}
              >
                <td
                  className="select-cell"
                  onClick={(event) => {
                    event.stopPropagation();
                    selectLead(lead.id, event.shiftKey);
                  }}
                >
                  <Checkbox
                    aria-label={`Select ${lead.businessName}`}
                    checked={selectedIds.includes(lead.id)}
                    size="small"
                    onChange={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      selectLead(lead.id, event.shiftKey);
                    }}
                  />
                </td>
                <td>{lead.clientId || "N/A"}</td><td title={lead.businessName}>{lead.businessName}</td><td title={lead.industry || undefined}>{lead.industry || "N/A"}</td><td title={lead.cityArea || undefined}>{lead.cityArea || "N/A"}</td><td>{lead.priority || "N/A"}</td><td title={lead.contactName || undefined}>{lead.contactName || "N/A"}</td><td className="phone-cell">{lead.phoneNumber || "N/A"}</td><td title={lead.email || undefined}>{lead.email || <span className="muted">No valid email</span>}</td><td>{lead.status || "N/A"}</td><td>{lead.packageName || "N/A"}</td><td title={`${lead.import.fileName} · ${new Date(lead.import.importedAt).toLocaleString()}`}>{shortImportName(lead.import.fileName)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      {!leads.length ? <p className="muted">No CSV leads imported yet.</p> : null}

      {showEmailModal ? (
        <ComposeModal title="Email selected CSV leads" onClose={() => setShowEmailModal(false)} busy={sendingEmail}>
          <div className="compose-recipients"><span>Recipients</span><strong>{emailLeads.length} lead{emailLeads.length === 1 ? "" : "s"} with valid email addresses</strong></div>
          <label>Subject<input value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} /></label>
          <label>Body<textarea ref={emailTextareaRef} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} rows={10} /></label>
          <button type="button" className="secondary compact-button" onClick={() => insertPlaceholder("email")}>Add [business_name]</button>
          <div className="field-group"><span>Attachments</span><input id={attachmentInputId} className="file-upload-input" type="file" multiple onChange={(event) => setAttachments(Array.from(event.target.files || []).slice(0, 5))} /><label className="button secondary compact-button" htmlFor={attachmentInputId}>Choose files</label><span className="field-note">{attachments.length ? attachments.map((item) => item.name).join(", ") : "Up to 5 files, 10MB each."}</span></div>
          <div className="compose-modal-actions"><button type="button" className="secondary" onClick={() => { setEmailSubject(emailSubjectTemplate); setEmailBody(emailBodyTemplate); }}>Reset</button><div className="compose-modal-action-group"><button type="button" className="secondary" onClick={() => setShowEmailModal(false)}>Cancel</button><button type="button" disabled={!emailSubject.trim() || !emailBody.trim()} onClick={sendEmails}>Send Email</button></div></div>
        </ComposeModal>
      ) : null}

      {showSmsModal ? (
        <ComposeModal title="SMS selected CSV leads" onClose={() => setShowSmsModal(false)} busy={sendingSms}>
          <div className="compose-recipients"><span>Recipients</span><strong>{smsLeads.length} lead{smsLeads.length === 1 ? "" : "s"} with valid Philippine mobile numbers</strong></div>
          <label>Message<textarea ref={smsTextareaRef} value={smsBody} onChange={(event) => setSmsBody(event.target.value)} rows={6} maxLength={1000} /></label>
          <div className="settings-template-helper"><button type="button" className="secondary compact-button" onClick={() => insertPlaceholder("sms")}>Add [business_name]</button><span className="field-note">{smsBody.length}/1000 characters</span></div>
          <div className="compose-modal-actions"><button type="button" className="secondary" onClick={() => setSmsBody(defaultSmsBodyTemplate)}>Reset</button><div className="compose-modal-action-group"><button type="button" className="secondary" onClick={() => setShowSmsModal(false)}>Cancel</button><button type="button" disabled={!smsBody.trim()} onClick={sendSmsMessages}>Send SMS</button></div></div>
        </ComposeModal>
      ) : null}
    </div>
  );
}

function ComposeModal({ title, onClose, busy, children }: { title: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={() => { if (!busy) onClose(); }}><div className="compose-modal" onClick={(event) => event.stopPropagation()}><div className="compose-modal-scroll"><div className="compose-modal-header"><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button></div><div className="compose-modal-body">{children}</div></div></div></div>;
}

function hasValidMobile(value: string | null) {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits) || /^639\d{9}$/.test(digits);
}

function shortImportName(fileName: string) {
  const segments = fileName.split(" - ");
  return segments.at(-1) || fileName;
}

function firstError(payload: { error?: { message?: string; details?: Array<{ error?: string }> } }) {
  return payload.error?.details?.find((detail) => detail.error)?.error || payload.error?.message;
}
