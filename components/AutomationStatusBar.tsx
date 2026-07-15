"use client";

import { useEffect, useState } from "react";

const dismissedStatusStorageKey = "lead-collection-dismissed-automation-status";

type OutreachStatus = {
  running: boolean;
  phase: string;
  message: string;
  startedAt: string | null;
  updatedAt: string | null;
  leadsContactedToday: number;
  target: number;
  emailEnabled: boolean;
  smsSent: number;
  smsFailed: number;
  emailSent: number;
  emailFailed: number;
};

const automationStatusUpdatedEvent = "automation-status-updated";

export function AutomationStatusBar({ initialStatus = null }: { initialStatus?: OutreachStatus | null }) {
  const [status, setStatus] = useState<OutreachStatus | null>(initialStatus);
  const [dismissedStatusKey, setDismissedStatusKey] = useState<string | null>(null);
  const [dismissedStatusLoaded, setDismissedStatusLoaded] = useState(false);

  useEffect(() => {
    setDismissedStatusKey(window.localStorage.getItem(dismissedStatusStorageKey));
    setDismissedStatusLoaded(true);
  }, []);

  useEffect(() => {
    function handleStatusUpdate(event: Event) {
      const customEvent = event as CustomEvent<OutreachStatus>;
      setStatus(customEvent.detail);
    }

    window.addEventListener(automationStatusUpdatedEvent, handleStatusUpdate);
    return () => window.removeEventListener(automationStatusUpdatedEvent, handleStatusUpdate);
  }, []);

  useEffect(() => {
    let active = true;

    async function fetchAutomationStatus(endpoint: "/api/automation/status" | "/api/automation/tick") {
      try {
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (active) setStatus(payload.data);
      } catch {
        // Status is informational; leave the previous server-rendered value in place.
      }
    }

    fetchAutomationStatus("/api/automation/tick");
    const statusInterval = window.setInterval(() => fetchAutomationStatus("/api/automation/status"), 5000);
    const wakeInterval = window.setInterval(() => fetchAutomationStatus("/api/automation/tick"), 60000);
    return () => {
      active = false;
      window.clearInterval(statusInterval);
      window.clearInterval(wakeInterval);
    };
  }, []);

  if (!status || status.phase === "idle" || status.phase === "disabled") return null;

  const failed = status.smsFailed + status.emailFailed;
  const statusKey = `${status.startedAt ?? "no-start"}:${status.phase}:${status.message}:${status.leadsContactedToday}:${status.target}:${status.smsSent}:${status.emailSent}`;
  const summaryDismissed = dismissedStatusKey === statusKey;
  if (!status.running && summaryDismissed && status.phase !== "done") return null;

  const isPaused = !status.running && status.phase !== "done";
  const statusLabel = status.running ? "Outreach running" : status.phase === "done" ? "Outreach done" : "Outreach paused";
  const showFinishedSummary = dismissedStatusLoaded && !status.running && status.phase === "done" && !summaryDismissed;

  function dismissStatus() {
    window.localStorage.setItem(dismissedStatusStorageKey, statusKey);
    setDismissedStatusKey(statusKey);
  }

  return (
    <>
      {status.running || isPaused ? (
        <div className={`automation-status-bar status-${isPaused ? "blocked" : status.phase}`} role="status">
          <span className="automation-status-dot" aria-hidden="true" />
          <span className="automation-status-main">{statusLabel}</span>
          <span>{status.message}</span>
          <span className="automation-status-metrics">
            Contacted {status.leadsContactedToday}/{status.target} today - {status.smsSent} SMS sent
            {status.emailEnabled ? ` - ${status.emailSent} emails sent` : ""} - {failed} failed
          </span>
          {!status.running ? (
            <button className="automation-status-close" type="button" onClick={dismissStatus} aria-label="Close automation status bar">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      ) : null}
      {showFinishedSummary ? (
        <div className="modal-backdrop automation-summary-backdrop" role="presentation" onClick={dismissStatus}>
          <div className="compose-modal automation-summary-modal" role="dialog" aria-modal="true" aria-labelledby="automation-summary-title" onClick={(event) => event.stopPropagation()}>
            <div className="automation-summary-header">
              <span className="automation-summary-success-icon status-done" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="m20 6-11 11-5-5" />
                </svg>
              </span>
              <div>
                <h2 id="automation-summary-title">{statusLabel}</h2>
                <p>{status.message}</p>
              </div>
            </div>
            <div className="automation-summary-body">
              <AutomationSummaryCard label="Leads contacted" value={status.leadsContactedToday} iconPaths={["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"]} />
              <AutomationSummaryCard label="Daily target" value={status.target} iconPaths={["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M12 12h.01"]} />
              <AutomationSummaryCard label="SMS sent" value={status.smsSent} iconPaths={["M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"]} />
              <AutomationSummaryCard label="Emails sent" value={status.emailSent} iconPaths={["M4 6h16v12H4Z", "M4 7l8 6 8-6"]} />
            </div>
            <div className="automation-summary-actions">
              <a className="button secondary" href="/sms-log" onClick={dismissStatus}>SMS logs</a>
              <button className="button" type="button" onClick={dismissStatus}>OK</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function AutomationSummaryCard({ label, value, iconPaths }: { label: string; value: number; iconPaths: string[] }) {
  return (
    <div className="automation-summary-card">
      <span className="automation-summary-card-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          {iconPaths.map((path, index) => (
            <path d={path} key={`${path}-${index}`} />
          ))}
        </svg>
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
