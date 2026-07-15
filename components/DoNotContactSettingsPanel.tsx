"use client";

import { useState } from "react";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";

export type DoNotContactEntry = {
  id: number;
  normalizedContact: string;
  channel: "sms" | "email";
  reason: string | null;
  source: string | null;
  createdAt: string;
};

type DoNotContactSettingsPanelProps = {
  initialEntries: DoNotContactEntry[];
};

export function DoNotContactSettingsPanel({ initialEntries }: DoNotContactSettingsPanelProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [contact, setContact] = useState("");
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  async function addEntry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setNotice("");
    const response = await fetch("/api/settings/do-not-contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact, channel, reason })
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setNoticeType("error");
      setNotice(payload.error?.message || "Unable to add the opt-out.");
      return;
    }

    const entry = { ...payload.data, createdAt: new Date(payload.data.createdAt).toISOString() } as DoNotContactEntry;
    setEntries((current) => [entry, ...current.filter((item) => item.id !== entry.id)]);
    setContact("");
    setReason("");
    setNoticeType("success");
    setNotice(`${entry.normalizedContact} is now excluded from ${entry.channel.toUpperCase()}.`);
  }

  async function removeEntry(entry: DoNotContactEntry) {
    if (removingId !== null) return;

    setRemovingId(entry.id);
    setNotice("");
    const response = await fetch("/api/settings/do-not-contact", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id })
    });
    const payload = await response.json();
    setRemovingId(null);

    if (!response.ok) {
      setNoticeType("error");
      setNotice(payload.error?.message || "Unable to remove the opt-out.");
      return;
    }

    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setNoticeType("success");
    setNotice(`${entry.normalizedContact} can receive ${entry.channel.toUpperCase()} again.`);
  }

  return (
    <section className="panel settings-panel do-not-contact-panel">
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
      <div className="settings-panel-body">
        <SettingPanelHeader
          title="Do Not Contact"
          subtitle="Active opt-outs are excluded from SMS and email composers, and enforced again by every send route."
        />

        <form className="do-not-contact-form" onSubmit={addEntry}>
          <label>
            Channel
            <select value={channel} onChange={(event) => setChannel(event.target.value as "sms" | "email")} disabled={saving}>
              <option value="sms">SMS</option>
              <option value="email">Email</option>
            </select>
          </label>
          <label>
            {channel === "sms" ? "Mobile number" : "Email address"}
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value)}
              placeholder={channel === "sms" ? "09171234567 or 639171234567" : "business@example.com"}
              inputMode={channel === "sms" ? "tel" : "email"}
              maxLength={channel === "sms" ? 40 : 254}
              disabled={saving}
              required
            />
          </label>
          <label>
            Reason <span className="field-note">(optional)</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Requested opt-out"
              maxLength={240}
              disabled={saving}
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add opt-out"}
          </button>
        </form>

        <div className="do-not-contact-list" aria-live="polite">
          <div className="do-not-contact-list-header">
            <strong>Active opt-outs</strong>
            <span>{entries.length}</span>
          </div>
          {entries.length === 0 ? (
            <p className="muted">No active opt-outs.</p>
          ) : (
            <ul>
              {entries.map((entry) => (
                <li key={entry.id}>
                  <div>
                    <strong>{entry.normalizedContact}</strong>
                    <small>{entry.channel.toUpperCase()}</small>
                    <span>{entry.reason || "No reason recorded"}</span>
                    <small>Added {entry.createdAt.slice(0, 10)}</small>
                  </div>
                  <button
                    type="button"
                    className="secondary compact-button"
                    onClick={() => removeEntry(entry)}
                    disabled={removingId !== null}
                  >
                    {removingId === entry.id ? "Removing…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
