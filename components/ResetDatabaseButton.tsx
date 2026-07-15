"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";

export function ResetDatabaseButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [notice, setNotice] = useState("");

  async function resetDatabase() {
    if (loading) return;
    setLoading(true);
    const response = await fetch("/api/settings/reset-db", { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);

    if (response.ok) {
      const data = payload.data ?? {};
      setNotice(`Database reset. Cleared ${data.deletedLeads ?? 0} leads and ${data.deletedBusinessProfiles ?? 0} SME profiles.`);
      setShowModal(false);
      router.refresh();
      return;
    }
    setNotice(payload.error?.message || "Unable to reset the database.");
  }

  return (
    <section className="panel settings-panel settings-action">
      {loading ? <LoadingModal label="Resetting database" /> : null}
      {notice ? <Snackbar message={notice} onDismiss={() => setNotice("")} /> : null}
      {showModal ? (
        <div className="modal-backdrop" role="presentation" onClick={() => !loading && setShowModal(false)}>
          <div className="compose-modal delete-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="reset-db-title" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-header">
              <ModalHeaderText
                id="reset-db-title"
                title="Reset database"
                subtitle="All collected leads, SME profiles, search runs, and message logs will be permanently removed."
              />
              <button className="icon-button" type="button" onClick={() => setShowModal(false)} disabled={loading} aria-label="Close reset confirmation">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="delete-confirmation-body">
              <p>This clears all collected data: leads, SME business profiles, search runs, SMS and email logs, and contact activity. This cannot be undone.</p>
              <p>Kept: franchise brands, commercial road zones, the Do Not Contact list, templates, and settings. Your admin login is unaffected.</p>
            </div>
            <div className="compose-modal-actions">
              <span />
              <div className="compose-modal-action-group">
                <button type="button" className="bordered-button" onClick={() => setShowModal(false)} disabled={loading}>Cancel</button>
                <button type="button" className="danger" onClick={resetDatabase} disabled={loading}>
                  <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M6 6l1 16h10l1-16" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                  Reset database
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <div className="settings-panel-body">
        <SettingPanelHeader
          title="Reset Database"
          subtitle="Clear all collected data (leads, SME profiles, runs, logs) while keeping franchise, zone, Do Not Contact, and settings data."
        />
      </div>
      <div className="settings-panel-footer">
        <button className="danger delete-button" type="button" onClick={() => setShowModal(true)} disabled={loading}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M6 6l1 16h10l1-16" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Reset Database
        </button>
      </div>
    </section>
  );
}
