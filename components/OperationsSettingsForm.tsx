"use client";

import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";
import { smeCategories } from "@/lib/sme/categories";
import type { OperationsSettings } from "@/lib/operations-settings";

const automationStatusUpdatedEvent = "automation-status-updated";

/** Client-safe copy of the ALL_NCR_CITIES sentinel from lib/sme/scheduled-search (that module pulls in Prisma). */
const ALL_NCR_CITIES = "ALL";

export function OperationsSettingsForm({ settings, cities }: { settings: OperationsSettings; cities: string[] }) {
  const [autoOutreachEnabled, setAutoOutreachEnabled] = useState(settings.autoOutreachEnabled);
  const [emailEnabled, setEmailEnabled] = useState(settings.emailEnabled);
  const [scheduleEnabled, setScheduleEnabled] = useState(settings.scheduleEnabled);
  const [scheduleStart, setScheduleStart] = useState(settings.scheduleStart);
  const [scheduleEnd, setScheduleEnd] = useState(settings.scheduleEnd);
  const [dailyLimit, setDailyLimit] = useState(settings.dailyLimit);
  const [outreachCity, setOutreachCity] = useState(settings.outreachCity);
  const [outreachCategories, setOutreachCategories] = useState<string[]>(settings.outreachCategories);
  const [outreachMaxPerCategory, setOutreachMaxPerCategory] = useState(settings.outreachMaxPerCategory);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  function toggleOutreachCategory(key: string, checked: boolean) {
    setOutreachCategories((prev) => (checked ? Array.from(new Set([...prev, key])) : prev.filter((item) => item !== key)));
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setLoadingLabel("Saving operations settings");
    const response = await fetch("/api/settings/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoOutreachEnabled,
        emailEnabled,
        scheduleEnabled,
        scheduleStart,
        scheduleEnd,
        dailyLimit,
        outreachCity,
        outreachCategories,
        outreachMaxPerCategory
      })
    });
    const payload = await response.json();

    if (response.ok) {
      await syncAutomationStatus(payload.data.autoOutreachEnabled ? "/api/automation/tick" : "/api/automation/status");
      setLoadingLabel("");
      setNoticeType("success");
      setNotice("Operations settings saved.");
      setAutoOutreachEnabled(payload.data.autoOutreachEnabled);
      setEmailEnabled(payload.data.emailEnabled);
      setScheduleEnabled(payload.data.scheduleEnabled);
      setScheduleStart(payload.data.scheduleStart);
      setScheduleEnd(payload.data.scheduleEnd);
      setDailyLimit(payload.data.dailyLimit);
      setOutreachCity(payload.data.outreachCity);
      setOutreachCategories(payload.data.outreachCategories);
      setOutreachMaxPerCategory(payload.data.outreachMaxPerCategory);
      return;
    }

    setLoadingLabel("");
    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save operations settings.");
  }

  return (
    <form className="operations-settings-form settings-panels-form" onSubmit={saveSettings}>
      {loadingLabel ? <LoadingModal label={loadingLabel} /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <section className="panel settings-panel">
        <div className="settings-panel-body">
          <SettingPanelHeader title="Automatic Outreach" subtitle="Automatically message captured SME leads over SMS, and optionally email." />
          <div className="automation-info">
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01" />
              <path d="M11 12h1v5h1" />
            </svg>
            <p>When enabled, the app sends an SMS to every SME lead with a contactable mobile number — and, if email is also enabled, an email to every lead with an email address — until the daily limit of leads contacted is reached. Do Not Contact, classification, and previously-failed screening still apply.</p>
          </div>
          <label className="switch-field">
            <input
              name="autoOutreachEnabled"
              type="checkbox"
              checked={autoOutreachEnabled}
              onChange={(event) => setAutoOutreachEnabled(event.target.checked)}
            />
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span>
              <strong>Automatic SMS sending</strong>
            </span>
          </label>
          <label className="switch-field">
            <input
              name="emailEnabled"
              type="checkbox"
              checked={emailEnabled}
              onChange={(event) => setEmailEnabled(event.target.checked)}
            />
            <span className="switch-track" aria-hidden="true">
              <span className="switch-thumb" />
            </span>
            <span>
              <strong>Also send emails</strong>
            </span>
          </label>
          <div className="automation-schedule-panel">
            <label className="switch-field">
              <input
                name="scheduleEnabled"
                type="checkbox"
                checked={scheduleEnabled}
                onChange={(event) => setScheduleEnabled(event.target.checked)}
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
                  name="scheduleStart"
                  type="time"
                  value={scheduleStart}
                  onChange={(event) => setScheduleStart(event.target.value)}
                />
              </label>
              <label>
                End time
                <input
                  name="scheduleEnd"
                  type="time"
                  value={scheduleEnd}
                  onChange={(event) => setScheduleEnd(event.target.value)}
                />
              </label>
            </div>
          </div>
          <div className="automation-schedule-panel">
            <SettingPanelHeader title="Search scope" subtitle="Before each daily send, collect fresh SME leads from this city and these categories." />
            <div className="automation-schedule-row">
              <label>
                City
                <select value={outreachCity} onChange={(event) => setOutreachCity(event.target.value)}>
                  <option value="">No lead collection (send existing only)</option>
                  <option value={ALL_NCR_CITIES}>All NCR cities</option>
                  {cities.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Max leads per category
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={outreachMaxPerCategory}
                  onChange={(event) => setOutreachMaxPerCategory(Number(event.target.value))}
                />
              </label>
            </div>
            <fieldset className="sme-category-checklist">
              <legend>Categories</legend>
              {smeCategories.map((item) => (
                <label key={item.key} className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={outreachCategories.includes(item.key)}
                    onChange={(event) => toggleOutreachCategory(item.key, event.target.checked)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </fieldset>
            {outreachCity === ALL_NCR_CITIES ? (
              <p className="field-note">All NCR cities × {outreachCategories.length || 0} categor{outreachCategories.length === 1 ? "y" : "ies"} runs many searches once per day — it can take several minutes and use significant Google Places quota.</p>
            ) : null}
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
      <section className="panel settings-panel">
        <div className="settings-panel-body">
          <SettingPanelHeader title="Operational Limit" subtitle="Set the maximum number of SME leads contacted automatically per day." />
          <div className="operations-limit-row">
            <label>
              Daily leads contacted limit(Max: 20)
              <input
                name="dailyLimit"
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
