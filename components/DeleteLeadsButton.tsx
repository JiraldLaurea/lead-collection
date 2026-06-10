"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";

type DeleteLeadsButtonProps = {
  leadCount: number;
};

export function DeleteLeadsButton({ leadCount }: DeleteLeadsButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [notice, setNotice] = useState("");

  async function deleteLeads() {
    if (leadCount === 0 || loading) return;

    setLoading(true);
    const response = await fetch("/api/leads", { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      const deletedLeads = payload.data?.deletedLeads ?? leadCount;
      const deletedEmailLogs = payload.data?.deletedEmailLogs ?? 0;
      setNotice(`${deletedLeads} leads and ${deletedEmailLogs} email logs deleted.`);
      setShowDeleteModal(false);
      router.refresh();
    }
  }

  return (
    <section className="panel settings-panel settings-action">
      {loading ? <LoadingModal label="Deleting leads" /> : null}
      {notice ? <Snackbar message={notice} onDismiss={() => setNotice("")} /> : null}
      {showDeleteModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !loading && setShowDeleteModal(false)}>
          <div className="compose-modal delete-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-leads-title" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-header">
              <ModalHeaderText
                id="delete-leads-title"
                title="Delete leads"
                subtitle={`${leadCount} lead${leadCount === 1 ? "" : "s"} and all email logs will be removed permanently.`}
              />
              <button className="icon-button" type="button" onClick={() => setShowDeleteModal(false)} disabled={loading} aria-label="Close delete confirmation">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="delete-confirmation-body">
              <p>This deletes all saved lead records and email log records from the database. This action cannot be undone.</p>
            </div>
            <div className="compose-modal-actions">
              <span />
              <div className="compose-modal-action-group">
                <button type="button" className="bordered-button" onClick={() => setShowDeleteModal(false)} disabled={loading}>Cancel</button>
                <button type="button" className="danger" onClick={deleteLeads} disabled={loading}>
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
      <div className="settings-panel-body">
        <SettingPanelHeader
          title="Lead Data"
          subtitle="Delete all saved leads and email logs from the database."
        />
      </div>
      <div className="settings-panel-footer">
        <button className="danger delete-button" type="button" onClick={() => setShowDeleteModal(true)} disabled={leadCount === 0 || loading}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 16h10l1-16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Delete Leads
        </button>
      </div>
    </section>
  );
}
