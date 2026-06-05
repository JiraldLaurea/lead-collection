"use client";

import { useState } from "react";

export type EmailLogRow = {
  id: number;
  sentAt: string;
  businessName: string;
  email: string;
  status: string;
  subject: string;
  body: string;
  errorMessage: string | null;
};

export function EmailLogTable({ logs }: { logs: EmailLogRow[] }) {
  const [selectedLog, setSelectedLog] = useState<EmailLogRow | null>(null);

  return (
    <>
      <div className="table-frame">
        <div className="table-scroll email-log-table-frame">
          <table className="email-log-table">
            <thead>
              <tr>
                <th>Sent</th>
                <th>Business name</th>
                <th>Email</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr className="clickable-row" key={log.id} onClick={() => setSelectedLog(log)}>
                  <td>{log.sentAt}</td>
                  <td><strong>{log.businessName}</strong></td>
                  <td>{log.email}</td>
                  <td><span className={`status-pill ${log.status === "sent" ? "status-pill-success" : "status-pill-muted"}`}>{log.status}</span></td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={4}>No email logs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {selectedLog ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setSelectedLog(null)}>
          <div className="compose-modal email-log-modal" role="dialog" aria-modal="true" aria-labelledby="email-log-title" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-scroll">
              <div className="compose-modal-header">
                <div>
                  <h2 id="email-log-title">Sent Email</h2>
                  <p className="muted">{selectedLog.sentAt}</p>
                </div>
                <button className="icon-button" type="button" onClick={() => setSelectedLog(null)} aria-label="Close email log preview">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="email-log-modal-body">
                <div className="detail-list email-log-detail-list">
                  <div className="detail-row"><span>Business name</span><strong>{selectedLog.businessName}</strong></div>
                  <div className="detail-row"><span>Recipient email</span><strong>{selectedLog.email}</strong></div>
                  <div className="detail-row"><span>Status</span><strong>{selectedLog.status}</strong></div>
                  {selectedLog.errorMessage ? <div className="detail-row"><span>Error</span><strong>{selectedLog.errorMessage}</strong></div> : null}
                </div>
                <section className="email-log-preview-block">
                  <h3>Subject</h3>
                  <p>{selectedLog.subject}</p>
                </section>
                <section className="email-log-preview-block">
                  <h3>Body</h3>
                  <pre>{selectedLog.body}</pre>
                </section>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
