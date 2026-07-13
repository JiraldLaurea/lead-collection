"use client";

import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";
import type { DebugSettings } from "@/lib/debug-settings";

export function DebugSettingsPanel({ settings }: { settings: DebugSettings }) {
  const [showLoadingModal, setShowLoadingModal] = useState(false);
  const [emailDryRunEnabled, setEmailDryRunEnabled] = useState(settings.emailDryRunEnabled);
  const [smsDryRunEnabled, setSmsDryRunEnabled] = useState(settings.smsDryRunEnabled);
  const [saving, setSaving] = useState(false);
  const [creatingSampleLead, setCreatingSampleLead] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setSaving(true);
    const response = await fetch("/api/settings/debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailDryRunEnabled, smsDryRunEnabled })
    });
    const payload = await response.json();
    setSaving(false);

    if (response.ok) {
      setEmailDryRunEnabled(payload.data.emailDryRunEnabled);
      setSmsDryRunEnabled(payload.data.smsDryRunEnabled);
      setNoticeType("success");
      setNotice("Debug settings saved.");
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save debug settings.");
  }

  async function createSampleLead() {
    setNotice("");
    setCreatingSampleLead(true);
    const response = await fetch("/api/settings/debug/sample-lead", { method: "POST" });
    const payload = await response.json();
    setCreatingSampleLead(false);

    if (response.ok) {
      setNoticeType("success");
      setNotice(`Sample lead ready: ${payload.data.businessName} (${payload.data.phoneNumber}, ${payload.data.email}).`);
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to create sample lead.");
  }

  return (
    <form className="panel settings-panel" onSubmit={saveSettings}>
      {showLoadingModal ? <LoadingModal label="Debug loading modal" onCancel={() => setShowLoadingModal(false)} /> : null}
      {saving ? <LoadingModal label="Saving debug settings" /> : null}
      {creatingSampleLead ? <LoadingModal label="Creating sample lead" /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="settings-panel-body">
        <SettingPanelHeader title="Debug" subtitle="Preview internal UI states and test automation without real outbound email or SMS." />
        <label className="switch-field">
          <input
            name="emailDryRunEnabled"
            type="checkbox"
            checked={emailDryRunEnabled}
            onChange={(event) => setEmailDryRunEnabled(event.target.checked)}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="switch-copy">
            <strong>Disable actual email sending</strong>
            <span className="field-note">Automation will still record sent email logs, but SMTP will not send to real leads.</span>
          </span>
        </label>
        <label className="switch-field">
          <input
            name="smsDryRunEnabled"
            type="checkbox"
            checked={smsDryRunEnabled}
            onChange={(event) => setSmsDryRunEnabled(event.target.checked)}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="switch-copy">
            <strong>Disable actual SMS sending</strong>
            <span className="field-note">Sends will still record SMS logs, but the SMS provider will not message real leads.</span>
          </span>
        </label>
      </div>
      <div className="settings-panel-footer">
        <button type="button" className="secondary" onClick={() => setShowLoadingModal(true)}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="m4.93 4.93 2.83 2.83" />
            <path d="m16.24 16.24 2.83 2.83" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="m4.93 19.07 2.83-2.83" />
            <path d="m16.24 7.76 2.83-2.83" />
          </svg>
          Show loading modal
        </button>
        <button type="button" className="secondary" onClick={createSampleLead} disabled={creatingSampleLead}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6" />
            <path d="M22 11h-6" />
          </svg>
          Create sample lead
        </button>
        <button type="submit" disabled={saving}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
          Save changes
        </button>
      </div>
    </form>
  );
}
