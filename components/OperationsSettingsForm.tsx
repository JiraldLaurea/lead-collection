"use client";

import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";
import type { OperationsSettings } from "@/lib/operations-settings";

const automationStatusUpdatedEvent = "automation-status-updated";

export function OperationsSettingsForm({ settings }: { settings: OperationsSettings }) {
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(settings.autoEmailEnabled);
  const [autoEmailScheduleEnabled, setAutoEmailScheduleEnabled] = useState(settings.autoEmailScheduleEnabled);
  const [autoEmailScheduleStart, setAutoEmailScheduleStart] = useState(settings.autoEmailScheduleStart);
  const [autoEmailScheduleEnd, setAutoEmailScheduleEnd] = useState(settings.autoEmailScheduleEnd);
  const [dailyLimit, setDailyLimit] = useState(settings.autoEmailDailyLimit);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setLoadingLabel("Saving operations settings");
    const response = await fetch("/api/settings/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoEmailEnabled,
        autoEmailScheduleEnabled,
        autoEmailScheduleStart,
        autoEmailScheduleEnd,
        autoEmailDailyLimit: dailyLimit
      })
    });
    const payload = await response.json();

    if (response.ok) {
      await syncAutomationStatus(payload.data.autoEmailEnabled ? "/api/automation/tick" : "/api/automation/status");
      setLoadingLabel("");
      setNoticeType("success");
      setNotice("Operations settings saved.");
      setAutoEmailEnabled(payload.data.autoEmailEnabled);
      setAutoEmailScheduleEnabled(payload.data.autoEmailScheduleEnabled);
      setAutoEmailScheduleStart(payload.data.autoEmailScheduleStart);
      setAutoEmailScheduleEnd(payload.data.autoEmailScheduleEnd);
      setDailyLimit(payload.data.autoEmailDailyLimit);
      return;
    }

    setLoadingLabel("");
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
      return;
    }

    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to start automatic email test.");
  }

  return (
    <form className="operations-settings-form settings-panels-form" onSubmit={saveSettings}>
      {loadingLabel ? <LoadingModal label={loadingLabel} /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <section className="panel settings-panel">
        <div className="settings-panel-body">
          <SettingPanelHeader title="Automatic Email Sending" subtitle="Control automated lead search, email discovery, and outreach sending." />
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
          <div className="automation-schedule-panel">
            <label className="switch-field">
              <input
                name="autoEmailScheduleEnabled"
                type="checkbox"
                checked={autoEmailScheduleEnabled}
                onChange={(event) => setAutoEmailScheduleEnabled(event.target.checked)}
              />
              <span className="switch-track" aria-hidden="true">
                <span className="switch-thumb" />
              </span>
              <span>
                <strong>Run only during a time window</strong>
              </span>
            </label>
            <div className="automation-schedule-row">
              <label>
                Start time
                <input
                  name="autoEmailScheduleStart"
                  type="time"
                  value={autoEmailScheduleStart}
                  onChange={(event) => setAutoEmailScheduleStart(event.target.value)}
                />
              </label>
              <label>
                End time
                <input
                  name="autoEmailScheduleEnd"
                  type="time"
                  value={autoEmailScheduleEnd}
                  onChange={(event) => setAutoEmailScheduleEnd(event.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="settings-panel-footer">
          <button className="secondary" type="button" onClick={testAutomation}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
            Test automatic email sending
          </button>
          <button type="submit">
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
              <path d="M17 21v-8H7v8" />
              <path d="M7 3v5h8" />
            </svg>
            Save changes
          </button>
        </div>
      </section>
      <section className="panel settings-panel">
        <div className="settings-panel-body">
          <SettingPanelHeader title="Operational Limit" subtitle="Set the maximum automated outreach emails allowed per day." />
          <div className="operations-limit-row">
            <label>
              Daily email sending limit(Max: 20)
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
        </div>
        <div className="settings-panel-footer">
          <button type="submit">
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
              <path d="M17 21v-8H7v8" />
              <path d="M7 3v5h8" />
            </svg>
            Save changes
          </button>
        </div>
      </section>
    </form>
  );
}

async function syncAutomationStatus(endpoint: "/api/automation/status" | "/api/automation/tick") {
  try {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    window.dispatchEvent(new CustomEvent(automationStatusUpdatedEvent, { detail: payload.data }));
  } catch {
    // The status bar polling will catch up if this immediate sync fails.
  }
}
