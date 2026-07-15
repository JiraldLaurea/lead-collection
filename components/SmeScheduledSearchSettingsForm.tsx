"use client";

import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { Snackbar } from "@/components/Snackbar";
import { smeCategories } from "@/lib/sme/categories";
import type { ScheduledSmeSearchSettings } from "@/lib/sme/scheduled-search";

type Zone = { id: number; city: string; commercialArea: string; roadName: string; latitude: number | null; longitude: number | null };

export function SmeScheduledSearchButton({ settings, zones, cities }: { settings: ScheduledSmeSearchSettings; zones: Zone[]; cities: string[] }) {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [locationMode, setLocationMode] = useState(settings.locationMode);
  const [zoneId, setZoneId] = useState(settings.zoneId ? String(settings.zoneId) : "");
  const [city, setCity] = useState(settings.city);
  const [category, setCategory] = useState(settings.category);
  const [maxResults, setMaxResults] = useState(settings.maxResults);
  const [radiusMeters, setRadiusMeters] = useState(settings.radiusMeters);
  const [localTime, setLocalTime] = useState(settings.localTime);
  const [loading, setLoading] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");

  function settingsPayload() {
    return { enabled, locationMode, zoneId: zoneId ? Number(zoneId) : null, city, category, maxResults, radiusMeters, localTime };
  }

  async function persistSettings() {
    const response = await fetch("/api/settings/sme-scheduled-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsPayload())
    });
    const payload = await response.json();
    return { response, payload };
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("Saving scheduled search");
    setNotice("");
    const { response, payload } = await persistSettings();
    setLoading("");
    if (!response.ok) {
      setNoticeType("error");
      setNotice(payload.error?.message || "Unable to save scheduled search settings.");
      return;
    }
    setNoticeType("success");
    setNotice("Scheduled SME search saved.");
  }

  async function runNow() {
    setLoading("Running scheduled SME search");
    setNotice("");
    const { response: settingsResponse, payload: settingsPayload } = await persistSettings();
    if (!settingsResponse.ok) {
      setLoading("");
      setNoticeType("error");
      setNotice(settingsPayload.error?.message || "Unable to save the current scheduled search settings.");
      return;
    }
    const response = await fetch("/api/sme-search/schedule/run", { method: "POST" });
    const payload = await response.json();
    setLoading("");
    if (!response.ok || !payload.data?.processed) {
      setNoticeType("error");
      setNotice(payload.error?.message || payload.data?.reason || "Scheduled SME search did not run.");
      return;
    }
    setNoticeType("success");
    window.location.assign("/sme-search/scheduled?completed=1");
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Schedule search</button>
      {open ? (
        <div className="modal-backdrop" role="presentation">
          <form className="compose-modal scheduled-search-modal" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="scheduled-search-title" onClick={(event) => event.stopPropagation()}>
            {loading ? <LoadingModal label={loading} /> : null}
            {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}
            <div className="compose-modal-scroll">
              <header className="compose-modal-header">
                <div>
                  <h2 id="scheduled-search-title">Scheduled SME Search</h2>
                  <p>Collect a shortlist for review. Email and SMS are never sent automatically.</p>
                </div>
                <button type="button" className="icon-button" aria-label="Close scheduled search" onClick={() => setOpen(false)} disabled={Boolean(loading)}>×</button>
              </header>
              <div className="compose-modal-body">
                <div className="automation-info sme-scheduled-search-info">
                  <p><strong>Hosted:</strong> Vercel Hobby runs once daily during the 9:00 AM Manila hour. <strong>Local:</strong> while this app is open locally, it runs at the time below (Manila time) if the hosted cron has not already run that day.</p>
                </div>
                <label className="switch-field">
                  <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                  <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
                  <span><strong>Enable scheduled SME search</strong></span>
                </label>
                <div className="sme-search-grid scheduled-search-grid">
                  <label>
                    Search area
                    <select value={locationMode} onChange={(event) => setLocationMode(event.target.value as typeof locationMode)}>
                      <option value="STREET">Street</option>
                      <option value="CITY">City</option>
                    </select>
                  </label>
                  {locationMode === "STREET" ? <>
                  <label>
                    Street
                    <select value={zoneId} onChange={(event) => setZoneId(event.target.value)} required={enabled}>
                      <option value="">Select a street</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id} disabled={zone.latitude === null || zone.longitude === null}>
                          {zone.roadName} — {zone.commercialArea}, {zone.city}{zone.latitude === null || zone.longitude === null ? " (needs coordinates)" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Search radius (m)
                    <input type="number" min={50} max={50000} step={50} value={radiusMeters} onChange={(event) => setRadiusMeters(Number(event.target.value))} />
                  </label>
                  </> : <label>
                    City
                    <select value={city} onChange={(event) => setCity(event.target.value)} required={enabled}>
                      <option value="">Select a city</option>
                      {cities.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>}
                  <label>
                    Category
                    <select value={category} onChange={(event) => setCategory(event.target.value)}>
                      <option value="">Any</option>
                      {smeCategories.filter((item) => item.googleTypes.length > 0).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                  </label>
                  <label>
                    Maximum Grade A results
                    <input type="number" min={1} max={60} value={maxResults} onChange={(event) => setMaxResults(Number(event.target.value))} />
                  </label>
                  <label>
                    Local run time (Manila)
                    <input type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} />
                  </label>
                </div>
                {category === "" ? <p className="field-note">Any category uses Google&apos;s location-biased discovery search; selecting a category gives the tightest radius matching.</p> : null}
              </div>
              <footer className="compose-modal-actions">
                <button type="button" className="secondary" onClick={runNow} disabled={Boolean(loading) || (locationMode === "STREET" ? !zoneId : !city)}>Run now</button>
                <div className="compose-modal-action-group">
                  <button type="button" className="secondary" onClick={() => setOpen(false)} disabled={Boolean(loading)}>Cancel</button>
                  <button type="submit" disabled={Boolean(loading)}>Save schedule</button>
                </div>
              </footer>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
