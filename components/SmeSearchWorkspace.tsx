"use client";

import { useRef, useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import { LoadingModal } from "@/components/LoadingModal";
import { SmeDetailDrawer } from "@/components/SmeDetailDrawer";
import { Snackbar } from "@/components/Snackbar";
import { TableStatusRow } from "@/components/TableStatusRow";
import { smeCategories } from "@/lib/sme/categories";
import { smeClassLabel, smeClassPillClassName } from "@/lib/sme/labels";
import type { SmeSearchResult } from "@/lib/sme/run-search";
import type { SearchMode, SearchRunSummary } from "@/lib/sme/types";

type SmeSearchWorkspaceProps = {
  cities: string[];
  zones: { city: string; commercialArea: string; roadName: string; latitude: number | null; longitude: number | null; radiusMeters: number }[];
};

const modes: { value: SearchMode; label: string; hint: string }[] = [
  { value: "COMMERCIAL_ROAD", label: "Commercial road / area", hint: "Search a configured commercial road." },
  { value: "CITY_CATEGORY", label: "City + category", hint: "Search a whole city for one category." },
  { value: "MAP_RADIUS", label: "Map radius", hint: "Search a circle around a coordinate." },
  { value: "FREE_TEXT", label: "Free text", hint: "Search a natural-language query." }
];

export function SmeSearchWorkspace({ cities, zones }: SmeSearchWorkspaceProps) {
  const [mode, setMode] = useState<SearchMode>("COMMERCIAL_ROAD");
  const [zoneKey, setZoneKey] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("cafe");
  const [keyword, setKeyword] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusMeters, setRadiusMeters] = useState("500");
  const [maxResults, setMaxResults] = useState("20");

  const [minRating, setMinRating] = useState("");
  const [minReviewCount, setMinReviewCount] = useState("");
  const [maxReviewCount, setMaxReviewCount] = useState("");
  const [hasPhone, setHasPhone] = useState("");
  const [hasWebsite, setHasWebsite] = useState("");
  const [smeOnly, setSmeOnly] = useState(true);
  const [excludeDoNotContact, setExcludeDoNotContact] = useState(true);
  const [excludePreviouslyContacted, setExcludePreviouslyContacted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SmeSearchResult[] | null>(null);
  const [summary, setSummary] = useState<SearchRunSummary | null>(null);
  const [reviewCount, setReviewCount] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<SmeSearchResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedZone = zones.find(
    (zone) => `${zone.city}|${zone.commercialArea}|${zone.roadName}` === zoneKey
  );

  // Only businesses a human may safely bulk-contact are shown when "SME only" is on.
  const visible = (results ?? []).filter((result) =>
    smeOnly
      ? ["INDEPENDENT_SME", "LOCAL_SME_CHAIN", "MANUAL_INCLUDE"].includes(result.classification.effectiveClass)
      : true
  );

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return; // repeated clicks must not spend a second round of API calls

    // A new search abandons the previous one rather than racing it.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError("");
    setSelected([]);

    const payload: Record<string, unknown> = {
      mode,
      maxResults: Number(maxResults) || 20,
      filters: {
        minRating: minRating ? Number(minRating) : undefined,
        minReviewCount: minReviewCount ? Number(minReviewCount) : undefined,
        maxReviewCount: maxReviewCount ? Number(maxReviewCount) : undefined,
        hasPhone: hasPhone === "" ? undefined : hasPhone === "true",
        hasWebsite: hasWebsite === "" ? undefined : hasWebsite === "true",
        excludeDoNotContact,
        excludePreviouslyContacted
      }
    };

    if (mode === "COMMERCIAL_ROAD" && selectedZone) {
      payload.city = selectedZone.city;
      payload.commercialArea = selectedZone.commercialArea;
      payload.roadName = selectedZone.roadName;
      payload.category = category;
      if (selectedZone.latitude !== null && selectedZone.longitude !== null) {
        payload.latitude = selectedZone.latitude;
        payload.longitude = selectedZone.longitude;
        payload.radiusMeters = selectedZone.radiusMeters;
      }
    }
    if (mode === "CITY_CATEGORY") {
      payload.city = city;
      payload.category = category;
      if (keyword.trim()) payload.keyword = keyword.trim();
    }
    if (mode === "MAP_RADIUS") {
      payload.latitude = Number(latitude);
      payload.longitude = Number(longitude);
      payload.radiusMeters = Number(radiusMeters) || 500;
      payload.category = category;
    }
    if (mode === "FREE_TEXT") {
      payload.keyword = keyword.trim();
    }

    try {
      const response = await fetch("/api/sme-search/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error?.message || "Search failed. Please try again.");
        setResults([]);
        setSummary(null);
        return;
      }

      setResults(data.data.results);
      setSummary(data.data.summary);
      setReviewCount(data.data.needsReview?.length ?? 0);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError("Search failed. Please try again.");
    } finally {
      if (abortRef.current === controller) {
        setLoading(false);
        abortRef.current = null;
      }
    }
  }

  function toggle(placeId: string) {
    setSelected((current) =>
      current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]
    );
  }

  function toggleAllVisible() {
    const selectable = visible.filter((result) => !result.doNotContact).map((result) => result.providerPlaceId);
    const allSelected = selectable.length > 0 && selectable.every((id) => selected.includes(id));
    setSelected(allSelected ? [] : selectable);
  }

  const selectableIds = visible.filter((result) => !result.doNotContact).map((result) => result.providerPlaceId);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
  const someSelected = selected.length > 0 && !allSelected;

  return (
    <>
      {loading ? <LoadingModal label="Searching Google Places" /> : null}
      {error ? <Snackbar message={error} type="error" onDismiss={() => setError("")} /> : null}
      {detail ? <SmeDetailDrawer result={detail} onClose={() => setDetail(null)} /> : null}

      <form className="panel settings-panel" onSubmit={search}>
        <div className="settings-panel-body">
          <h2 className="panel-title">SME Business Search</h2>

          <div className="sme-search-grid">
            <label>
              Search mode
              <select value={mode} onChange={(event) => setMode(event.target.value as SearchMode)}>
                {modes.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            {mode === "COMMERCIAL_ROAD" ? (
              <label>
                Commercial road
                <select value={zoneKey} onChange={(event) => setZoneKey(event.target.value)} required>
                  <option value="">Select a road</option>
                  {zones.map((zone) => {
                    const key = `${zone.city}|${zone.commercialArea}|${zone.roadName}`;
                    return (
                      <option key={key} value={key}>
                        {zone.roadName} — {zone.commercialArea}, {zone.city}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : null}

            {mode === "CITY_CATEGORY" ? (
              <label>
                City
                <select value={city} onChange={(event) => setCity(event.target.value)} required>
                  <option value="">Select a city</option>
                  {cities.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {mode === "MAP_RADIUS" ? (
              <>
                <label>
                  Latitude
                  <input value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="14.5547" required />
                </label>
                <label>
                  Longitude
                  <input value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="121.0244" required />
                </label>
                <label>
                  Radius (m)
                  <input type="number" min={50} max={50000} value={radiusMeters} onChange={(event) => setRadiusMeters(event.target.value)} />
                </label>
              </>
            ) : null}

            {mode !== "FREE_TEXT" ? (
              <label>
                Category
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {smeCategories.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label} ({item.priority})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {mode === "FREE_TEXT" || mode === "CITY_CATEGORY" ? (
              <label>
                Keyword {mode === "CITY_CATEGORY" ? "(optional)" : ""}
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  placeholder="independent cafe in Tomas Morato"
                  required={mode === "FREE_TEXT"}
                />
              </label>
            ) : null}

            <label>
              Max results
              <input type="number" min={1} max={60} value={maxResults} onChange={(event) => setMaxResults(event.target.value)} />
            </label>
          </div>

          <div className="sme-search-grid">
            <label>
              Min rating
              <input type="number" min={0} max={5} step={0.1} value={minRating} onChange={(event) => setMinRating(event.target.value)} placeholder="Any" />
            </label>
            <label>
              Min reviews
              <input type="number" min={0} value={minReviewCount} onChange={(event) => setMinReviewCount(event.target.value)} placeholder="Any" />
            </label>
            <label>
              Max reviews
              <input type="number" min={0} value={maxReviewCount} onChange={(event) => setMaxReviewCount(event.target.value)} placeholder="Any" />
            </label>
            <label>
              Has phone
              <select value={hasPhone} onChange={(event) => setHasPhone(event.target.value)}>
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Has website
              <select value={hasWebsite} onChange={(event) => setHasWebsite(event.target.value)}>
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>

          <div className="settings-template-helper">
            <label className="inline-check">
              <input type="checkbox" checked={smeOnly} onChange={(event) => setSmeOnly(event.target.checked)} />
              SME only
            </label>
            <label className="inline-check">
              <input type="checkbox" checked={excludeDoNotContact} onChange={(event) => setExcludeDoNotContact(event.target.checked)} />
              Exclude Do Not Contact
            </label>
            <label className="inline-check">
              <input
                type="checkbox"
                checked={excludePreviouslyContacted}
                onChange={(event) => setExcludePreviouslyContacted(event.target.checked)}
              />
              Not contacted yet
            </label>
          </div>
        </div>

        <div className="settings-panel-footer">
          <span className="field-note">{modes.find((item) => item.value === mode)?.hint}</span>
          <button type="submit" disabled={loading}>
            <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      {summary ? (
        <div className="sme-summary">
          <span className="sme-summary-chip">
            <strong>{summary.total}</strong> found
          </span>
          <span className="sme-summary-chip">
            <strong>{summary.qualified}</strong> qualified
          </span>
          <span className="sme-summary-chip">
            <strong>{summary.manualReview}</strong> need review
          </span>
          <span className="sme-summary-chip">
            <strong>{summary.excluded}</strong> excluded
          </span>
          <span className="sme-summary-chip">
            <strong>{summary.alreadySaved}</strong> already saved
          </span>
          {reviewCount > 0 ? (
            <span className="sme-summary-chip">
              <strong>{reviewCount}</strong> possible duplicates
            </span>
          ) : null}
        </div>
      ) : null}

      {results ? (
        <div className="table-frame">
          <div className="table-scroll">
            <table className="leads-table">
              <thead>
                <tr>
                  <th className="select-cell">
                    <span className="checkbox-hit-area">
                      <Checkbox
                        aria-label="Select all results"
                        size="small"
                        checked={allSelected}
                        indeterminate={someSelected}
                        disabled={selectableIds.length === 0}
                        onChange={toggleAllVisible}
                      />
                    </span>
                  </th>
                  <th>Business</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Rating</th>
                  <th>Contact</th>
                  <th>SME status</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <TableStatusRow colSpan={9} itemCount={visible.length} selectedCount={selected.length} itemLabel="result" />
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted">
                      No results. Try a wider radius, another category, or turn off &quot;SME only&quot; to see
                      excluded franchises.
                    </td>
                  </tr>
                ) : (
                  visible.map((result) => (
                    <tr key={result.providerPlaceId}>
                      <td className="select-cell">
                        <span className="checkbox-hit-area">
                          <Checkbox
                            aria-label={`Select ${result.displayName}`}
                            size="small"
                            checked={selected.includes(result.providerPlaceId)}
                            disabled={result.doNotContact}
                            onChange={() => toggle(result.providerPlaceId)}
                          />
                        </span>
                      </td>
                      <td>{result.displayName}</td>
                      <td>{result.primaryType ?? "—"}</td>
                      <td>{result.formattedAddress ?? "—"}</td>
                      <td>{result.rating ? `${result.rating} (${result.reviewCount ?? 0})` : "—"}</td>
                      <td>
                        <span className="sme-contact-icons">
                          <span className={result.phoneNumber ? "present" : undefined}>Phone</span>
                          <span className={result.websiteUrl ? "present" : undefined}>Web</span>
                        </span>
                      </td>
                      <td>
                        <span className={smeClassPillClassName(result.classification.effectiveClass)}>
                          {smeClassLabel(result.classification.effectiveClass)}
                        </span>
                      </td>
                      <td>
                        {result.doNotContact ? (
                          <span className="status-pill status-pill-muted">Do not contact</span>
                        ) : result.savedLeadId ? (
                          <span className="status-pill status-pill-success">Saved</span>
                        ) : (
                          <span className="muted">New</span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="secondary compact-button" onClick={() => setDetail(result)}>
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </>
  );
}
