"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Checkbox from "@mui/material/Checkbox";
import { LeadFiltersModal } from "@/components/LeadFiltersModal";
import { LoadingModal } from "@/components/LoadingModal";
import { emailSubjectTemplate } from "@/lib/email-template-defaults";
import { fetchWithTimeout, isAbortError } from "@/lib/fetch-timeout";
import { emailStatusPillClassName, formatCategoryLabel, formatEmailStatus } from "@/lib/format";
import type { LeadFilters } from "@/lib/leads";

export type LeadSelectionItem = {
  id: number;
  businessName: string;
  category: string | null;
  formattedAddress: string | null;
  phoneNumber: string | null;
  email: string | null;
  emailStatus: string | null;
  websiteUrl: string | null;
  rating: number | null;
};

type LeadSelectionTableProps = {
  leads: LeadSelectionItem[];
  filters: LeadFilters;
  categories: string[];
  websiteFilterValue: string;
  phoneFilterValue: string;
  emailBodyTemplate: string;
};

export function LeadSelectionTable({ leads, filters, categories, websiteFilterValue, phoneFilterValue, emailBodyTemplate }: LeadSelectionTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailSubject, setEmailSubject] = useState(emailSubjectTemplate);
  const [emailBody, setEmailBody] = useState(emailBodyTemplate);
  const [emailNotice, setEmailNotice] = useState("");
  const [emailNoticeType, setEmailNoticeType] = useState<"success" | "error">("success");
  const selectedLeads = useMemo(
    () => leads.filter((lead) => selectedIds.includes(lead.id)),
    [leads, selectedIds]
  );
  const visibleLeadIds = useMemo(() => leads.map((lead) => lead.id), [leads]);
  const selectedEmails = selectedLeads.map((lead) => lead.email).filter((email): email is string => Boolean(email));
  const selectedNeedsEmailDiscovery = selectedLeads.some((lead) => !lead.email);
  const allSelected = visibleLeadIds.length > 0 && visibleLeadIds.every((id) => selectedIds.includes(id));
  const someSelected = visibleLeadIds.some((id) => selectedIds.includes(id)) && !allSelected;
  const emailDisplay = (lead: LeadSelectionItem) => lead.email || formatEmailStatus(lead.emailStatus);
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    ["keyword", "area", "category", "minRating", "hasWebsite", "hasPhone"].forEach((key) => {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [searchParams]);
  const valueOrNA = (value?: string | number | null) => value ?? "N/A";

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

  async function discoverEmails() {
    if (selectedIds.length === 0) return;
    setEmailNotice("");
    setEmailNoticeType("success");
    setLoading(true);
    try {
      await fetchWithTimeout("/api/leads/email-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadIds: selectedIds })
      }, 30000);
      router.refresh();
    } catch (error) {
      setEmailNoticeType("error");
      setEmailNotice(isAbortError(error) ? "Finding emails timed out. Try fewer leads or try again later." : "Unable to find emails.");
    } finally {
      setLoading(false);
    }
  }

  async function sendSelectedEmails() {
    if (selectedEmails.length === 0 || sendingEmail) return;
    setEmailNotice("");
    setEmailNoticeType("success");
    setSendingEmail(true);
    const response = await fetch("/api/leads/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: selectedIds, subject: emailSubject, body: emailBody })
    });
    const payload = await response.json();
    setSendingEmail(false);

    if (response.ok) {
      setEmailNoticeType("success");
      setEmailNotice(`Sent ${payload.data.sent} email${payload.data.sent === 1 ? "" : "s"}.`);
      setShowEmailModal(false);
      return;
    }

    const firstDetailError = Array.isArray(payload.error?.details)
      ? payload.error.details.find((detail: { error?: string }) => detail.error)?.error
      : undefined;
    setEmailNoticeType("error");
    setEmailNotice(firstDetailError || payload.error?.message || "Unable to send selected emails.");
  }

  function resetEmailTemplate() {
    setEmailSubject(emailSubjectTemplate);
    setEmailBody(emailBodyTemplate);
  }

  return (
    <div className="stack">
      {loading ? <LoadingModal label="Finding emails" /> : null}
      {sendingEmail ? <LoadingModal label="Sending emails" /> : null}
      {showEmailModal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="email-compose-title">
          <div className="compose-modal">
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
                <textarea value={emailBody} onChange={(event) => setEmailBody(event.target.value)} rows={10} />
              </label>
              <p className="muted compose-hint">Use [business_name] to personalize each email.</p>
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
      ) : null}
      {emailNotice ? <div className={`notice ${emailNoticeType === "success" ? "notice-success" : "notice-error"}`}>{emailNotice}</div> : null}
      <div className="bulk-actions">
        <div className="bulk-actions-left">
          <span className="muted">{selectedIds.length} selected</span>
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
        </div>
        <div className="bulk-actions-right">
          <LeadFiltersModal
            filters={filters}
            categories={categories}
            websiteFilterValue={websiteFilterValue}
            phoneFilterValue={phoneFilterValue}
          />
          <details className="download-menu">
            <summary className="button secondary">
              <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 20h14" />
              </svg>
              Download
            </summary>
            <div className="download-menu-panel">
              <a href={`/api/export/csv${exportQuery}`}>CSV</a>
              <a href={`/api/export/xlsx${exportQuery}`}>XLSX</a>
            </div>
          </details>
        </div>
      </div>
      <div className="table-frame leads-table-frame">
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
              <th>Name</th>
              <th>Category</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Website</th>
              <th>Rating</th>
            </tr>
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
              <td>{lead.businessName}</td>
              <td>{formatCategoryLabel(lead.category)}</td>
              <td>{valueOrNA(lead.formattedAddress)}</td>
              <td className="phone-cell">{valueOrNA(lead.phoneNumber)}</td>
              <td>{lead.email ? emailDisplay(lead) : <span className={emailStatusPillClassName(lead.emailStatus)}>{emailDisplay(lead)}</span>}</td>
              <td className="website-cell">{lead.websiteUrl ? <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>{lead.websiteUrl}</a> : "N/A"}</td>
              <td>{valueOrNA(lead.rating)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
