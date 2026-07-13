"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Checkbox from "@mui/material/Checkbox";
import { LoadingModal } from "@/components/LoadingModal";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { SmsLogFiltersModal, type SmsLogFilters } from "@/components/SmsLogFiltersModal";
import { Snackbar } from "@/components/Snackbar";
import { TableStatusRow } from "@/components/TableStatusRow";

export type SmsLogRow = {
  id: number;
  leadId: number | null;
  sentAt: string;
  businessName: string;
  phone: string;
  status: string;
  provider: string;
  providerMessageId: string | null;
  deliveryStatus: string | null;
  deliveryError: string | null;
  deliveryReceipt: string | null;
  deliveredAt: string | null;
  body: string;
  errorMessage: string | null;
};

export function SmsLogTable({ logs, filters }: { logs: SmsLogRow[]; filters: SmsLogFilters }) {
  const router = useRouter();
  const [selectedLog, setSelectedLog] = useState<SmsLogRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const visibleLogIds = useMemo(() => logs.map((log) => log.id), [logs]);
  const allSelected = visibleLogIds.length > 0 && visibleLogIds.every((id) => selectedIds.includes(id));
  const someSelected = visibleLogIds.some((id) => selectedIds.includes(id)) && !allSelected;

  function toggleLog(id: number) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleAllVisibleLogs() {
    setSelectedIds((current) => {
      const visibleIds = new Set(visibleLogIds);
      if (allSelected) return current.filter((id) => !visibleIds.has(id));
      return Array.from(new Set([...current, ...visibleLogIds]));
    });
  }

  async function deleteSelectedLogs() {
    if (selectedIds.length === 0 || deleting) return;
    setNotice("");
    setDeleting(true);
    const response = await fetch("/api/sms-log", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds })
    });
    const payload = await response.json();
    setDeleting(false);

    if (response.ok) {
      const deleted = payload.data?.deleted ?? selectedIds.length;
      setNoticeType("success");
      setNotice(`${deleted} SMS log${deleted === 1 ? "" : "s"} deleted.`);
      setSelectedIds([]);
      setShowDeleteModal(false);
      router.refresh();
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to delete selected SMS logs.");
  }

  return (
    <div className="stack">
      {deleting ? <LoadingModal label="Deleting SMS logs" /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="bulk-actions">
        <div className="bulk-actions-left" />
        <div className="bulk-actions-right">
          <SmsLogFiltersModal filters={filters} />
          <button
            type="button"
            className="delete-button"
            disabled={selectedIds.length === 0}
            onClick={() => setShowDeleteModal(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M6 6l1 16h10l1-16" />
              <path d="M10 11v6" />
              <path d="M14 11v6" />
            </svg>
            Delete
          </button>
        </div>
      </div>
      <div className="table-frame">
        <div className="table-scroll email-log-table-frame">
          <table className="email-log-table sms-log-table">
            <thead>
              <tr>
                <th
                  className="select-cell"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (visibleLogIds.length > 0) toggleAllVisibleLogs();
                  }}
                >
                  <span className="checkbox-hit-area">
                    <Checkbox
                      aria-label="Select all SMS logs"
                      checked={allSelected}
                      disabled={logs.length === 0}
                      indeterminate={someSelected}
                      size="small"
                      onChange={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleAllVisibleLogs();
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleAllVisibleLogs();
                        }
                      }}
                    />
                  </span>
                </th>
                <th>Sent</th>
                <th>Business name</th>
                <th>Phone</th>
                <th>Provider</th>
                <th>Delivery</th>
                <th>Status</th>
              </tr>
              <TableStatusRow colSpan={7} itemCount={logs.length} selectedCount={selectedIds.length} itemLabel="SMS log" />
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  className={`clickable-row ${selectedIds.includes(log.id) ? "selected-row" : ""}`}
                  key={log.id}
                  onClick={() => setSelectedLog(log)}
                >
                  <td
                    className="select-cell"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleLog(log.id);
                    }}
                  >
                    <span className="checkbox-hit-area">
                      <Checkbox
                        aria-label={`Select ${log.businessName}`}
                        checked={selectedIds.includes(log.id)}
                        size="small"
                        onChange={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleLog(log.id);
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleLog(log.id);
                          }
                        }}
                      />
                    </span>
                  </td>
                  <td>{log.sentAt}</td>
                  <td><strong>{log.businessName}</strong></td>
                  <td>{log.phone}</td>
                  <td>{log.provider}</td>
                  <td>{log.deliveryStatus ? <span className={`status-pill ${isDelivered(log.deliveryStatus) ? "status-pill-success" : "status-pill-muted"}`}>{formatDeliveryStatus(log.deliveryStatus)}</span> : <span className="muted">pending</span>}</td>
                  <td><span className={`status-pill ${isSuccessfulStatus(log.status) ? "status-pill-success" : "status-pill-muted"}`}>{log.status}</span></td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7}>No SMS logs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {showDeleteModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="compose-modal delete-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-sms-logs-title" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-header">
              <ModalHeaderText
                id="delete-sms-logs-title"
                title="Delete SMS logs"
                subtitle={`${selectedIds.length} selected SMS log${selectedIds.length === 1 ? "" : "s"} will be removed permanently.`}
              />
              <button className="icon-button" type="button" onClick={() => setShowDeleteModal(false)} disabled={deleting} aria-label="Close delete confirmation">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="delete-confirmation-body">
              <p>This only deletes the SMS log records. It will not delete the lead or business data.</p>
            </div>
            <div className="compose-modal-actions">
              <span />
              <div className="compose-modal-action-group">
                <button type="button" className="bordered-button" onClick={() => setShowDeleteModal(false)} disabled={deleting}>Cancel</button>
                <button type="button" className="danger" onClick={deleteSelectedLogs} disabled={deleting}>
                  <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 16h10l1-16" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedLog ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedLog(null)}>
          <div className="compose-modal email-log-modal" role="dialog" aria-modal="true" aria-labelledby="sms-log-title" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-scroll">
              <div className="compose-modal-header">
                <div>
                  <h2 id="sms-log-title">Sent SMS</h2>
                  <p className="muted email-log-subtitle">{selectedLog.sentAt}</p>
                </div>
                <button className="icon-button" type="button" onClick={() => setSelectedLog(null)} aria-label="Close SMS log preview">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="email-log-modal-body">
                <div className="detail-list email-log-detail-list">
                  <div className="detail-row"><span>Business name</span><strong>{selectedLog.businessName}</strong></div>
                  <div className="detail-row"><span>Recipient phone</span><strong>{selectedLog.phone}</strong></div>
                  <div className="detail-row"><span>Status</span><strong>{selectedLog.status}</strong></div>
                  <div className="detail-row"><span>Provider</span><strong>{selectedLog.provider}</strong></div>
                  {selectedLog.providerMessageId ? <div className="detail-row"><span>Provider message ID</span><strong>{selectedLog.providerMessageId}</strong></div> : null}
                  <div className="detail-row"><span>Delivery status</span><strong>{selectedLog.deliveryStatus ? formatDeliveryStatus(selectedLog.deliveryStatus) : "pending receipt"}</strong></div>
                  {selectedLog.deliveredAt ? <div className="detail-row"><span>Delivered at</span><strong>{selectedLog.deliveredAt}</strong></div> : null}
                  {selectedLog.deliveryError ? <div className="detail-row"><span>Delivery error</span><strong>{selectedLog.deliveryError}</strong></div> : null}
                  {selectedLog.errorMessage ? <div className="detail-row"><span>Error</span><strong>{selectedLog.errorMessage}</strong></div> : null}
                </div>
                <section className="email-log-preview-block">
                  <h3>Message body</h3>
                  <pre>{selectedLog.body}</pre>
                </section>
                {selectedLog.deliveryReceipt ? (
                  <section className="email-log-preview-block">
                    <h3>Raw delivery receipt</h3>
                    <pre>{selectedLog.deliveryReceipt}</pre>
                  </section>
                ) : null}
              </div>
              <div className="compose-modal-actions">
                <span />
                {selectedLog.leadId ? (
                  <a className="button" href={`/leads/${selectedLog.leadId}`}>
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    View lead
                  </a>
                ) : (
                  <button type="button" className="bordered-button" disabled>
                    Lead unavailable
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function isDelivered(status: string) {
  return ["DELIVRD", "DELIVERED", "2"].includes(status.toUpperCase());
}

function isSuccessfulStatus(status: string) {
  return ["sent", "delivered"].includes(status.toLowerCase());
}

function formatDeliveryStatus(status: string) {
  const normalized = status.toUpperCase();
  const labels: Record<string, string> = {
    "1": "ENROUTE",
    "2": "DELIVERED",
    "3": "EXPIRED",
    "4": "DELETED",
    "5": "UNDELIVERABLE",
    "6": "ACCEPTED",
    "7": "UNKNOWN",
    "8": "REJECTED",
    DELIVRD: "DELIVERED",
    UNDELIV: "UNDELIVERABLE",
    REJECTD: "REJECTED",
  };
  const label = labels[normalized];
  return label ? `${label} (${status})` : status;
}
