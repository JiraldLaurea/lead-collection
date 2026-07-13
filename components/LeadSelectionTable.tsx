"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Checkbox from "@mui/material/Checkbox";
import { LeadFiltersModal } from "@/components/LeadFiltersModal";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { TableStatusRow } from "@/components/TableStatusRow";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-timeout";
import { emailStatusPillClassName, formatCategoryLabel, formatCity, formatDateTime, formatEmailStatus } from "@/lib/format";
import type { LeadFilters } from "@/lib/leads";

export type LeadSelectionItem = {
  id: number;
  businessName: string;
  searchLocation: string;
  category: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  email: string | null;
  emailStatus: string | null;
  websiteUrl: string | null;
  rating: number | null;
  collectedAt: Date | string;
};

type LeadSelectionTableProps = {
  leads: LeadSelectionItem[];
  filters: LeadFilters;
  categories: string[];
  websiteFilterValue: string;
  phoneFilterValue: string;
  emailFilterValue: string;
  emailBodyTemplate: string;
  smsBodyTemplate: string;
  totalCount: number;
  currentPage: number;
  pageSize: number;
  totalPages: number;
};

export function LeadSelectionTable({
  leads,
  filters,
  categories,
  websiteFilterValue,
  phoneFilterValue,
  emailFilterValue,
  emailBodyTemplate,
  smsBodyTemplate,
  totalCount,
  currentPage,
  pageSize,
  totalPages
}: LeadSelectionTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [emailDiscoveryProgress, setEmailDiscoveryProgress] = useState({ searched: 0, total: 0 });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState(emailSubjectTemplate);
  const [emailBody, setEmailBody] = useState(emailBodyTemplate);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailNoticeType, setEmailNoticeType] = useState<"success" | "error">("success");
  const [sendingSms, setSendingSms] = useState(false);
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsBody, setSmsBody] = useState(smsBodyTemplate);
  const downloadMenuRef = useRef<HTMLDetailsElement>(null);
  const emailBodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const smsBodyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputId = useId();
  const businessNamePlaceholder = "[business_name]";
  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedIds.includes(lead.id)),
    [leads, selectedIds]
  );
  const visibleLeadIds = useMemo(() => leads.map((lead) => lead.id), [leads]);
  const selectedEmails = selectedLeads.map((lead) => lead.email).filter((email): email is string => Boolean(email));
  const selectedNeedsEmailDiscovery = selectedLeads.some(isEmailDiscoveryPending);
  const selectedSmsLeads = selectedLeads.filter((lead) => hasExportablePhoneNumber(lead.phoneNumber));
  const selectedCanExportPhones = selectedSmsLeads.length > 0;
  const allSelected = visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selectedIds.includes(id));
  const someSelected = visibleLeadIds.some((id) => selectedIds.includes(id)) && !allSelected;
  const emailDisplay = (lead: LeadSelectionItem) => lead.email || formatEmailStatus(lead.emailStatus);
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    ["keyword", "area", "category", "minRating", "hasWebsite", "hasPhone", "hasEmail"].forEach((key) => {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [searchParams]);
  const phoneExportQuery = useMemo(() => {
    if (selectedIds.length === 0) return "";
    return `?ids=${selectedIds.join(",")}`;
  }, [selectedIds]);
  const valueOrNA = (value?: string | number | null) => value ?? "N/A";

  useEffect(() => {
    function closeDownloadMenu(event: MouseEvent | TouchEvent) {
      const menu = downloadMenuRef.current;
      if (!menu?.open || menu.contains(event.target as Node)) return;
      menu.open = false;
    }

    document.addEventListener("mousedown", closeDownloadMenu);
    document.addEventListener("touchstart", closeDownloadMenu);
    return () => {
      document.removeEventListener("mousedown", closeDownloadMenu);
      document.removeEventListener("touchstart", closeDownloadMenu);
    };
  }, []);

  useEffect(() => {
    setSelectedIds([]);
  }, [currentPage, pageSize]);

  function toggleLead(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisibleLeads() {
    setSelectedIds((current) => {
      const visibleIds = new Set(visibleLeadIds);
      if (allSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }
      return Array.from(new Set([...current, ...visibleLeadIds]));
    });
  }

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(Math.min(Math.max(page, 1), totalPages)));
    params.set("pageSize", String(pageSize));
    router.push(`/leads?${params.toString()}`);
  }

  function changePageSize(nextPageSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");
    params.set("pageSize", String(nextPageSize));
    router.push(`/leads?${params.toString()}`);
  }

  async function discoverEmails() {
    if (selectedIds.length === 0) return;
    const leadsToSearch = selectedLeads.filter(isEmailDiscoveryPending);
    if (leadsToSearch.length === 0) return;

    setEmailNotice("");
    setEmailNoticeType("success");
    setEmailDiscoveryProgress({ searched: 0, total: leadsToSearch.length });
    setLoading(true);
    let found = 0;
    let failed = 0;
    try {
      for (const lead of leadsToSearch) {
        try {
          const response = await fetchWithTimeout(`/api/leads/${lead.id}/discover-email`, {
            method: "POST"
          }, 20000);
          const payload = await response.json();
          if (response.ok && payload.success && payload.data?.status === "FOUND") {
            found += 1;
          } else if (!response.ok) {
            failed += 1;
          }
        } catch (error) {
          failed += 1;
          void error;
        } finally {
          setEmailDiscoveryProgress((current) => ({ ...current, searched: current.searched + 1 }));
        }
      }
      router.refresh();
      setEmailNoticeType(failed > 0 ? "error" : "success");
      setEmailNotice(
        failed > 0
          ? `Searched ${leadsToSearch.length} lead${leadsToSearch.length === 1 ? "" : "s"}. Found ${found} email${found === 1 ? "" : "s"}, ${failed} failed.`
          : `Searched ${leadsToSearch.length} lead${leadsToSearch.length === 1 ? "" : "s"}. Found ${found} email${found === 1 ? "" : "s"}.`
      );
    } catch (error) {
      setEmailNoticeType("error");
      setEmailNotice(isAbortError(error) ? "Finding emails timed out. Try fewer leads or try again later." : "Unable to find emails.");
    } finally {
      setLoading(false);
      setEmailDiscoveryProgress({ searched: 0, total: 0 });
    }
  }

  async function sendSelectedEmails() {
    if (selectedEmails.length === 0 || sendingEmail) return;
    setEmailNotice("");
    setEmailNoticeType("success");
    setSendingEmail(true);
    const formData = new FormData();
    formData.append("leadIds", JSON.stringify(selectedIds));
    formData.append("subject", emailSubject);
    formData.append("body", emailBody);
    attachments.forEach((file) => formData.append("attachments", file));
    const response = await fetch("/api/leads/send-email", {
      method: "POST",
      body: formData
    });
    const payload = await response.json();
    setSendingEmail(false);

    if (response.ok) {
      setEmailNoticeType("success");
      setEmailNotice(`Sent ${payload.data.sent} email${payload.data.sent === 1 ? "" : "s"}.`);
      setShowEmailModal(false);
      setAttachments([]);
      return;
    }

    const firstDetailError = Array.isArray(payload.error?.details)
      ? payload.error.details.find((detail: { error?: string }) => detail.error)?.error
      : undefined;
    setEmailNoticeType("error");
    setEmailNotice(firstDetailError || payload.error?.message || "Unable to send selected emails.");
  }

  async function sendSelectedSms() {
    if (selectedSmsLeads.length === 0 || sendingSms) return;
    setEmailNotice("");
    setEmailNoticeType("success");
    setSendingSms(true);
    const response = await fetch("/api/leads/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadIds: selectedSmsLeads.map((lead) => lead.id),
        body: smsBody
      })
    });
    const payload = await response.json();
    setSendingSms(false);

    if (response.ok) {
      setEmailNoticeType("success");
      setEmailNotice(`Sent ${payload.data.sent} SMS message${payload.data.sent === 1 ? "" : "s"}.`);
      setShowSmsModal(false);
      return;
    }

    const firstDetailError = Array.isArray(payload.error?.details)
      ? payload.error.details.find((detail: { error?: string }) => detail.error)?.error
      : undefined;
    setEmailNoticeType("error");
    setEmailNotice(firstDetailError || payload.error?.message || "Unable to send selected SMS messages.");
  }

  function resetSmsTemplate() {
    setSmsBody(smsBodyTemplate);
  }

  function insertSmsBusinessNamePlaceholder() {
    const textarea = smsBodyTextareaRef.current;
    if (!textarea) {
      setSmsBody((current) => `${current}${current ? " " : ""}${businessNamePlaceholder}`);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const nextBody = `${smsBody.slice(0, start)}${businessNamePlaceholder}${smsBody.slice(end)}`;
    setSmsBody(nextBody);

    requestAnimationFrame(() => {
      textarea.focus();
      const nextCursorPosition = start + businessNamePlaceholder.length;
      textarea.setSelectionRange(nextCursorPosition, nextCursorPosition);
    });
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
    <div className="stack">
      {loading ? (
        <LoadingModal
          label="Finding emails"
          message={`${emailDiscoveryProgress.searched}/${emailDiscoveryProgress.total} leads searched`}
        />
      ) : null}
      {sendingEmail ? <LoadingModal label="Sending emails" /> : null}
      {sendingSms ? <LoadingModal label="Sending SMS" /> : null}
      {showSmsModal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sms-compose-title"
          onClick={() => {
            if (!sendingSms) setShowSmsModal(false);
          }}
        >
          <div className="compose-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-scroll">
              <div className="compose-modal-header">
                <div>
                  <h2 id="sms-compose-title">SMS selected leads</h2>
                </div>
                <button type="button" className="icon-button" aria-label="Close SMS modal" onClick={() => setShowSmsModal(false)} disabled={sendingSms}>
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
                    {selectedSmsLeads.map((lead) => (
                      <span className="recipient-pill" key={lead.id}>{lead.businessName}</span>
                    ))}
                  </div>
                </div>
                <label>
                  Message
                  <textarea ref={smsBodyTextareaRef} value={smsBody} onChange={(event) => setSmsBody(event.target.value)} rows={6} maxLength={1000} />
                </label>
                <div className="settings-template-helper">
                  <button type="button" className="secondary compact-button" onClick={insertSmsBusinessNamePlaceholder} disabled={sendingSms}>
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                    Add [business_name]
                  </button>
                  <span className="field-note">{smsBody.length}/1000 characters</span>
                </div>
              </div>
              <div className="compose-modal-actions">
                <button type="button" className="secondary" onClick={resetSmsTemplate} disabled={sendingSms}>
                  <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <path d="M3 4v5h5" />
                  </svg>
                  Reset
                </button>
                <div className="compose-modal-action-group">
                  <button type="button" className="secondary" onClick={() => setShowSmsModal(false)} disabled={sendingSms}>Cancel</button>
                  <button type="button" onClick={sendSelectedSms} disabled={sendingSms || !smsBody.trim()}>
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                    {sendingSms ? "Sending..." : "Send SMS"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {showEmailModal ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-compose-title"
          onClick={() => {
            if (!sendingEmail) setShowEmailModal(false);
          }}
        >
          <div className="compose-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-scroll">
              <div className="compose-modal-header">
                <div>
                  <h2 id="email-compose-title">Email selected leads</h2>
                </div>
                <button type="button" className="icon-button" aria-label="Close email modal" onClick={() => setShowEmailModal(false)} disabled={sendingEmail}>
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
                    {selectedLeads.filter((lead) => lead.email).map((lead) => (
                      <span className="recipient-pill" key={lead.id}>{lead.businessName}</span>
                    ))}
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
                  <button type="button" className="secondary compact-button" onClick={insertBusinessNamePlaceholder} disabled={sendingEmail}>
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
                    disabled={sendingEmail}
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
                  <span className="field-note">Up to 5 files, 10MB max each file.</span>
                </div>
                {attachments.length > 0 ? (
                  <div className="attachment-list">
                    {attachments.map((file, index) => (
                      <span className="attachment-pill" key={`${file.name}-${file.size}-${index}`}>
                        {file.name}
                        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removeAttachment(index)} disabled={sendingEmail}>
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
                <button type="button" className="secondary" onClick={resetEmailTemplate} disabled={sendingEmail}>
                  <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                    <path d="M3 4v5h5" />
                  </svg>
                  Reset
                </button>
                <div className="compose-modal-action-group">
                  <button type="button" className="secondary" onClick={() => setShowEmailModal(false)} disabled={sendingEmail}>Cancel</button>
                  <button type="button" onClick={sendSelectedEmails} disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}>
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m22 2-7 20-4-9-9-4Z" />
                      <path d="M22 2 11 13" />
                    </svg>
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {emailNotice ? <Snackbar message={emailNotice} type={emailNoticeType} onDismiss={() => setEmailNotice("")} /> : null}
      <div className="bulk-actions">
        <div className="bulk-actions-left">
          <button type="button" className="secondary" disabled={!selectedNeedsEmailDiscovery || loading} onClick={discoverEmails}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            {loading ? "Finding..." : "Find Emails"}
          </button>
          <button
            type="button"
            disabled={selectedEmails.length === 0 || sendingEmail}
            onClick={() => setShowEmailModal(true)}
          >
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 3a2.8 2.8 0 0 1 4 4L8 20l-5 1 1-5Z" />
              <path d="m15 5 4 4" />
            </svg>
            {sendingEmail ? "Sending..." : "Compose Email"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={selectedSmsLeads.length === 0 || sendingSms}
            onClick={() => setShowSmsModal(true)}
          >
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
            </svg>
            {sendingSms ? "Sending..." : "Send SMS"}
          </button>
        </div>
        <div className="bulk-actions-right">
          <LeadFiltersModal
            filters={filters}
            categories={categories}
            websiteFilterValue={websiteFilterValue}
            phoneFilterValue={phoneFilterValue}
            emailFilterValue={emailFilterValue}
          />
          <details className="download-menu" ref={downloadMenuRef}>
            <summary className="button secondary">
              Download
            </summary>
            <div className="download-menu-panel">
              <a href={`/api/export/csv${exportQuery}`}>CSV</a>
              <a href={`/api/export/xlsx${exportQuery}`}>XLSX</a>
              {selectedCanExportPhones ? (
                <a href={`/api/export/phones/csv${phoneExportQuery}`}>Phone CSV</a>
              ) : (
                <span className="download-menu-disabled">Phone CSV</span>
              )}
            </div>
          </details>
        </div>
      </div>
      <div className="table-frame">
        <div className="table-scroll leads-table-frame">
          <table className="leads-table">
            <thead>
              <tr>
                <th
                  className="select-cell"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (visibleLeadIds.length > 0) toggleAllVisibleLeads();
                  }}
                >
                  <span className="checkbox-hit-area">
                    <Checkbox
                      aria-label="Select all leads"
                      checked={allSelected}
                      disabled={leads.length === 0}
                      indeterminate={someSelected}
                      size="small"
                      onChange={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleAllVisibleLeads();
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleAllVisibleLeads();
                        }
                      }}
                    />
                  </span>
                </th>
                <th>City</th>
                <th>Name</th>
                <th>Category</th>
                <th>Address</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Website</th>
                <th>Rating</th>
                <th>Searched</th>
              </tr>
              <TableStatusRow colSpan={10} itemCount={totalCount} selectedCount={selectedIds.length} itemLabel="lead" />
            </thead>
            <tbody>{leads.map((lead) => (
              <tr
                key={lead.id}
                className={`clickable-row ${selectedIds.includes(lead.id) ? "selected-row" : ""}`}
                tabIndex={0}
                onClick={() => router.push(`/leads/${lead.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(`/leads/${lead.id}`);
                  }
                }}
              >
                <td
                  className="select-cell"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleLead(lead.id);
                  }}
                >
                  <span className="checkbox-hit-area">
                    <Checkbox
                      aria-label={`Select ${lead.businessName}`}
                      checked={selectedIds.includes(lead.id)}
                      size="small"
                      onChange={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleLead(lead.id);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleLead(lead.id);
                        }
                      }}
                    />
                  </span>
                </td>
                <td>{formatCity(lead.searchLocation)}</td>
                <td>{lead.businessName}</td>
                <td>{formatCategoryLabel(lead.category)}</td>
                <td>{valueOrNA(lead.formattedAddress)}</td>
                <td className="phone-cell">{valueOrNA(lead.phoneNumber)}</td>
                <td>{lead.email ? emailDisplay(lead) : <span className={emailStatusPillClassName(lead.emailStatus)}>{emailDisplay(lead)}</span>}</td>
                <td className="website-cell">{lead.websiteUrl ? <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{lead.websiteUrl}</a> : "N/A"}</td>
                <td>{valueOrNA(lead.rating)}</td>
                <td className="datetime-cell">{formatDateTime(lead.collectedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
      <div className="table-pagination">
        <span className="muted">
          Page {currentPage} of {totalPages}
        </span>
        <div className="table-pagination-controls">
          <label className="table-page-size">
            Rows
            <select value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))}>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
          <button type="button" className="secondary" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
            Previous
          </button>
          <button type="button" className="secondary" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function isEmailDiscoveryPending(lead: LeadSelectionItem) {
  return !lead.email && (!lead.emailStatus || lead.emailStatus === "NOT_CHECKED");
}

function hasExportablePhoneNumber(value?: string | null) {
  if (!value) return false;
  const digits = value.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits) || /^639\d{9}$/.test(digits);
}
