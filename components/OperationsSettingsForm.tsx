"use client";

import { useEffect, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import type { OperationsSettings } from "@/lib/operations-settings";

type AutomationStatus = {
  running: boolean;
  phase: string;
  message: string;
  sentToday: number;
  target: number;
  searchesRun: number;
  emailsFound: number;
  emailsSent: number;
  emailFailed: number;
};

export function OperationsSettingsForm({ settings }: { settings: OperationsSettings }) {
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(settings.autoEmailEnabled);
  const [dailyLimit, setDailyLimit] = useState(settings.autoEmailDailyLimit);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const [status, setStatus] = useState<AutomationStatus | null>(null);

  async function refreshStatus() {
    const response = await fetch("/api/automation/status", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok) setStatus(payload.data);
  }

  useEffect(() => {
    refreshStatus();
    const interval = window.setInterval(refreshStatus, 5000);
    return () => window.clearInterval(interval);
  }, []);

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setLoadingLabel("Saving operations settings");
    const response = await fetch("/api/settings/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoEmailEnabled, autoEmailDailyLimit: dailyLimit })
    });
    const payload = await response.json();
    setLoadingLabel("");

    if (response.ok) {
      setNoticeType("success");
      setNotice("Operations settings saved.");
      setAutoEmailEnabled(payload.data.autoEmailEnabled);
      setDailyLimit(payload.data.autoEmailDailyLimit);
      await refreshStatus();
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save operations settings.");
  }

  async function testAutomation() {
    setNotice("");
    setLoadingLabel("Starting automatic email test");
    const response = await fetch("/api/automation/test-email", { method: "POST" });
    const payload = await response.json();
    setLoadingLabel("");

    if (response.ok) {
      setNoticeType("success");
      setNotice("Automatic email test started.");
      setStatus(payload.data);
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to start automatic email test.");
  }

  return (
    <form className="operations-settings-form" onSubmit={saveSettings}>
      {loadingLabel ? <LoadingModal label={loadingLabel} /> : null}
      <div>
        <h2>General</h2>
        <p className="muted">Manage automatic lead search, email discovery, and outreach sending.</p>
      </div>
      <div className="automation-info">
        <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01" />
          <path d="M11 12h1v5h1" />
        </svg>
        <p>When enabled, the app runs randomized Places text searches, checks returned leads for email addresses, and sends outreach until the daily email limit is reached.</p>
      </div>
      <label className="switch-field">
        <input
          name="autoEmailEnabled"
          type="checkbox"
          checked={autoEmailEnabled}
          onChange={(event) => setAutoEmailEnabled(event.target.checked)}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span>
          <strong>Automatic email sending</strong>
        </span>
      </label>
      <div className="operations-limit-row">
        <label>
          Daily email sending limit
          <input
            name="autoEmailDailyLimit"
            type="number"
            min={1}
            max={20}
            step={1}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(Number(event.target.value))}
          />
        </label>
      </div>
      {status ? (
        <div className="automation-status">
          <strong>{status.phase}</strong>
          <span>{status.message}</span>
          <span>{status.sentToday}/{status.target} sent today</span>
          <span>{status.searchesRun} searches, {status.emailsFound} emails found, {status.emailFailed} failed</span>
        </div>
      ) : null}
      {notice ? <div className={`notice ${noticeType === "success" ? "notice-success" : "notice-error"}`}>{notice}</div> : null}
      <div className="operations-settings-actions">
        <button type="submit">
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
          Save changes
        </button>
        <button className="secondary" type="button" onClick={testAutomation}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
          Test automatic email sending
        </button>
      </div>
    </form>
  );
}
