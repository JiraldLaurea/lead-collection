"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Checkbox from "@mui/material/Checkbox";
import { LoadingModal } from "@/components/LoadingModal";
import { SmeDetailDrawer } from "@/components/SmeDetailDrawer";
import { SmsComposerModal } from "@/components/SmsComposerModal";
import { SmeEmailComposerModal } from "@/components/SmeEmailComposerModal";
import { SmeScheduledSearchButton } from "@/components/SmeScheduledSearchSettingsForm";
import { emptySmeTableFilters, SmeTableFiltersModal, type SmeTableFilters } from "@/components/SmeTableFiltersModal";
import { Snackbar } from "@/components/Snackbar";
import { TableStatusRow } from "@/components/TableStatusRow";
import { smeCategories } from "@/lib/sme/categories";
import { scoreBandPillClassName, smeClassLabel, smeClassPillClassName } from "@/lib/sme/labels";
import type { SmeSearchResult } from "@/lib/sme/run-search";
import type { SearchMode, SearchRunSummary } from "@/lib/sme/types";
import type { ScheduledSmeSearchSettings } from "@/lib/sme/scheduled-search";

type SmeSearchWorkspaceProps = {
  cities: string[];
  zones: {
    id: number;
    city: string;
    commercialArea: string;
    roadName: string;
    latitude: number | null;
    longitude: number | null;
    radiusMeters: number;
    priority: string;
  }[];
  smsBodyTemplate: string;
  emailBodyTemplate: string;
  initialResults: SmeSearchResult[];
  scheduledSearch: {
    searchRunId: number;
    completedAt: string;
    zoneLabel: string;
    resultCount: number;
    summary: SearchRunSummary;
  } | null;
  scheduledSearchSettings: ScheduledSmeSearchSettings;
  showSearchForm?: boolean;
};

const modes: { value: SearchMode; label: string; hint: string }[] = [
  { value: "COMMERCIAL_ROAD", label: "Commercial road / area", hint: "Search a configured commercial road." },
  { value: "CITY_CATEGORY", label: "City + category", hint: "Search a whole city for one category." },
  { value: "MAP_RADIUS", label: "Map radius", hint: "Search a circle around a coordinate." },
  { value: "FREE_TEXT", label: "Free text", hint: "Search a natural-language query." }
];

type SmeSortKey = "BUSINESS" | "LOCATION" | "CONTACT" | "SCORE" | "LEAD_STATUS";
type SortDirection = "asc" | "desc";

function leadStatusLabel(result: SmeSearchResult) {
  if (result.doNotContact) return "Do not contact";
  return result.leadStatus.replaceAll("_", " ").toLocaleLowerCase().replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function contactAvailabilityScore(result: SmeSearchResult) {
  return (result.phoneNumber ? 4 : 0) + (result.email ? 2 : 0) + (result.websiteUrl ? 1 : 0);
}

function compareSmeResults(left: SmeSearchResult, right: SmeSearchResult, sort: { key: SmeSortKey; direction: SortDirection }) {
  let comparison = 0;

  switch (sort.key) {
    case "BUSINESS":
      comparison = left.displayName.localeCompare(right.displayName);
      break;
    case "LOCATION":
      comparison = (left.formattedAddress ?? "").localeCompare(right.formattedAddress ?? "");
      break;
    case "CONTACT":
      comparison = contactAvailabilityScore(left) - contactAvailabilityScore(right);
      break;
    case "LEAD_STATUS":
      comparison = leadStatusLabel(left).localeCompare(leadStatusLabel(right));
      break;
    case "SCORE":
      comparison = left.score.total - right.score.total;
      break;
  }

  if (comparison === 0 && sort.key !== "BUSINESS") {
    comparison = left.displayName.localeCompare(right.displayName);
  }
  return sort.direction === "asc" ? comparison : -comparison;
}

function SortDirectionIndicator({ direction }: { direction?: SortDirection }) {
  return (
    <svg className="sme-table-sort-indicator" viewBox="0 0 16 16" aria-hidden="true">
      {direction === "asc" ? <path d="m4 10 4-4 4 4" /> : null}
      {direction === "desc" ? <path d="m4 6 4 4 4-4" /> : null}
      {!direction ? <><path d="m4 6 4-4 4 4" /><path d="m4 10 4 4 4-4" /></> : null}
    </svg>
  );
}

export function SmeSearchWorkspace({ cities, zones, smsBodyTemplate, emailBodyTemplate, initialResults, scheduledSearch, scheduledSearchSettings, showSearchForm = true }: SmeSearchWorkspaceProps) {
  const [mode, setMode] = useState<SearchMode>("COMMERCIAL_ROAD");
  const [zoneKey, setZoneKey] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("cafe_resto");
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
  const [businessStatus, setBusinessStatus] = useState("");
  const [classification, setClassification] = useState("");
  const [franchiseStatus, setFranchiseStatus] = useState("");
  const [leadStatus, setLeadStatus] = useState("");
  const [smeOnly, setSmeOnly] = useState(true);
  const [excludeDoNotContact, setExcludeDoNotContact] = useState(true);
  const [excludePreviouslyContacted, setExcludePreviouslyContacted] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<SmeSearchResult[] | null>(initialResults);
  const [summary, setSummary] = useState<SearchRunSummary | null>(showSearchForm ? null : scheduledSearch?.summary ?? null);
  const [reviewCount, setReviewCount] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [tableFilters, setTableFilters] = useState<SmeTableFilters>(emptySmeTableFilters);
  const [sort, setSort] = useState<{ key: SmeSortKey; direction: SortDirection }>({ key: "SCORE", direction: "desc" });
  const [pageSize, setPageSize] = useState<20 | 50 | 100 | 200>(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<SmeSearchResult | null>(null);
  const [findingEmails, setFindingEmails] = useState(false);
  const [notice, setNotice] = useState("");
  const [composerPlaceIds, setComposerPlaceIds] = useState<string[] | null>(null);
  const [emailRecipientPlaceIds, setEmailRecipientPlaceIds] = useState<string[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedZone = zones.find(
    (zone) => `${zone.city}|${zone.commercialArea}|${zone.roadName}` === zoneKey
  );

  async function discoverResultEmails(candidates: SmeSearchResult[]) {
    const pending = candidates.filter((result) => !result.email && result.websiteUrl);
    if (pending.length === 0) return;
    setFindingEmails(true);
    try {
      const response = await fetch("/api/sme-search/email-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerPlaceIds: pending.map((result) => result.providerPlaceId) })
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) return;
      const emails = new Map<string, string>(
        payload.data.results
          .filter((item: { email: string | null }): item is { providerPlaceId: string; email: string } => Boolean(item.email))
          .map((item: { providerPlaceId: string; email: string }) => [item.providerPlaceId, item.email])
      );
      setResults((current) => (current ?? []).map((result) => emails.has(result.providerPlaceId) ? { ...result, email: emails.get(result.providerPlaceId) } : result));
    } finally {
      setFindingEmails(false);
    }
  }

  // Only businesses a human may safely bulk-contact are shown when "SME only" is on.
  // Highest score first, so the leads worth calling are at the top of the page.
  const visible = (results ?? [])
    .filter((result) =>
      smeOnly
        ? ["INDEPENDENT_SME", "LOCAL_SME_CHAIN", "MANUAL_INCLUDE"].includes(result.classification.effectiveClass)
        : true
    )
    .filter((result) => {
      const query = tableFilters.query.toLocaleLowerCase();
      const matchesQuery = !query || [result.displayName, result.formattedAddress, result.primaryType]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(query));
      const matchesContact = !tableFilters.contact
        || (tableFilters.contact === "PHONE" && Boolean(result.phoneNumber))
        || (tableFilters.contact === "EMAIL" && Boolean(result.email))
        || (tableFilters.contact === "WEBSITE" && Boolean(result.websiteUrl));
      const matchesScoreBand = !tableFilters.scoreBand || result.score.band === tableFilters.scoreBand;
      const matchesClassification = !tableFilters.classification || result.classification.effectiveClass === tableFilters.classification;
      const matchesLeadStatus = !tableFilters.leadStatus || leadStatusLabel(result).toLocaleUpperCase().replaceAll(" ", "_") === tableFilters.leadStatus;
      return matchesQuery && matchesContact && matchesScoreBand && matchesClassification && matchesLeadStatus;
    })
    .slice()
    .sort((left, right) => compareSmeResults(left, right, sort));
  const totalPages = Math.max(1, Math.ceil(visible.length / pageSize));
  const activePage = Math.min(currentPage, totalPages);
  const pageResults = visible.slice((activePage - 1) * pageSize, activePage * pageSize);

  function toggleSort(key: SmeSortKey) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
    setCurrentPage(1);
  }

  function sortButtonProps(key: SmeSortKey, label: string) {
    const isActive = sort.key === key;
    return {
      type: "button" as const,
      className: `sme-table-sort-button${isActive ? " is-active" : ""}`,
      onClick: () => toggleSort(key),
      "aria-label": `Sort by ${label}`,
      "aria-pressed": isActive
    };
  }

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
    setCurrentPage(1);

    const payload: Record<string, unknown> = {
      mode,
      maxResults: Number(maxResults) || 20,
      filters: {
        minRating: minRating ? Number(minRating) : undefined,
        minReviewCount: minReviewCount ? Number(minReviewCount) : undefined,
        maxReviewCount: maxReviewCount ? Number(maxReviewCount) : undefined,
        hasPhone: hasPhone === "" ? undefined : hasPhone === "true",
        hasWebsite: hasWebsite === "" ? undefined : hasWebsite === "true",
        businessStatus: businessStatus || undefined,
        classification: classification || undefined,
        franchiseStatus: franchiseStatus || undefined,
        leadStatus: leadStatus || undefined,
        excludeDoNotContact,
        excludePreviouslyContacted
      }
    };

    if (mode === "COMMERCIAL_ROAD" && selectedZone) {
      payload.city = selectedZone.city;
      payload.commercialArea = selectedZone.commercialArea;
      payload.roadName = selectedZone.roadName;
      payload.category = category;
      // Feeds the commercial-area-value factor of the lead score.
      payload.zonePriority = selectedZone.priority;
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
      void discoverResultEmails(data.data.results);
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

  const selectedResults = (results ?? []).filter((result) => selected.includes(result.providerPlaceId));
  const selectedProviderPlaceIds = selectedResults.map((result) => result.providerPlaceId);

  function openSmsComposer() {
    if (selectedProviderPlaceIds.length === 0) {
      setError("Select at least one business before composing an SMS.");
      return;
    }
    setComposerPlaceIds(selectedProviderPlaceIds);
  }

  function canSelect(result: SmeSearchResult) {
    return !result.doNotContact && Boolean(result.phoneNumber || result.email);
  }

  function selectionBlockReason(result: SmeSearchResult) {
    if (result.doNotContact) return "This business is on the Do Not Contact list.";
    return "An email address or phone number is required before this business can be selected.";
  }

  function toggle(placeId: string) {
    const result = visible.find((item) => item.providerPlaceId === placeId);
    if (!result || !canSelect(result)) return;
    setSelected((current) =>
      current.includes(placeId) ? current.filter((id) => id !== placeId) : [...current, placeId]
    );
  }

  // Do Not Contact businesses are excluded from selection and checked again by the server
  // before sending, so a bulk action cannot accidentally include a suppressed recipient.
  function toggleAllOnPage() {
    const selectable = pageResults.filter(canSelect).map((result) => result.providerPlaceId);
    setSelected((current) => {
      const allPageResultsSelected = selectable.length > 0 && selectable.every((id) => current.includes(id));

      return allPageResultsSelected
        ? current.filter((id) => !selectable.includes(id))
        : Array.from(new Set([...current, ...selectable]));
    });
  }

  const selectablePageIds = pageResults.filter(canSelect).map((result) => result.providerPlaceId);
  const allSelected = selectablePageIds.length > 0 && selectablePageIds.every((id) => selected.includes(id));
  const someSelected = selectablePageIds.some((id) => selected.includes(id)) && !allSelected;

  function exportVisibleCsv() {
    const rows = visible.map((result) => ({
      score: result.score.total,
      band: result.score.band,
      business_name: result.displayName,
      category: result.primaryType ?? "",
      location: result.formattedAddress ?? "",
      phone: result.phoneNumber ?? "",
      email: result.email ?? "",
      website: result.websiteUrl ?? "",
      rating: result.rating ?? "",
      review_count: result.reviewCount ?? "",
      sme_status: smeClassLabel(result.classification.effectiveClass),
      lead_status: result.savedLeadId ? "Lead saved" : "Captured"
    }));
    const headers = Object.keys(rows[0] ?? { score: "" });
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((row) => headers.map((key) => escape(row[key as keyof typeof row])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `sme-search-results-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      {loading ? <LoadingModal label="Searching Google Places" /> : null}
      {findingEmails ? <LoadingModal label="Finding emails" /> : null}
      {error ? <Snackbar message={error} type="error" onDismiss={() => setError("")} /> : null}
      {notice ? <Snackbar message={notice} type="success" onDismiss={() => setNotice("")} /> : null}
      {detail ? (
        <SmeDetailDrawer
          result={detail}
          onClose={() => setDetail(null)}
          onOverridden={(providerPlaceId, effectiveClass) => {
            setResults((current) =>
              (current ?? []).map((item) =>
                item.providerPlaceId === providerPlaceId
                  ? { ...item, classification: { ...item.classification, effectiveClass: effectiveClass as typeof item.classification.effectiveClass } }
                  : item
              )
            );
            setNotice(`Classification changed to ${effectiveClass}.`);
          }}
        />
      ) : null}
      {composerPlaceIds ? (
        <SmsComposerModal
          providerPlaceIds={composerPlaceIds}
          initialBody={smsBodyTemplate}
          onClose={() => setComposerPlaceIds(null)}
          onSent={(sent, failed) => {
            setComposerPlaceIds(null);
            setSelected([]);
            setNotice(`Sent ${sent} SMS message${sent === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`);
          }}
        />
      ) : null}
      {emailRecipientPlaceIds ? (
        <SmeEmailComposerModal
          providerPlaceIds={emailRecipientPlaceIds}
          initialBody={emailBodyTemplate}
          onClose={() => setEmailRecipientPlaceIds(null)}
          onSent={(sent, failed) => {
            setEmailRecipientPlaceIds(null);
            setNotice(`Sent ${sent} email${sent === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.`);
          }}
        />
      ) : null}

      {showSearchForm ? <form className="panel settings-panel" onSubmit={search}>
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
            <label>
              Business status
              <select value={businessStatus} onChange={(event) => setBusinessStatus(event.target.value)}>
                <option value="">Any</option>
                <option value="OPERATIONAL">Operational</option>
                <option value="CLOSED_TEMPORARILY">Temporarily closed</option>
                <option value="CLOSED_PERMANENTLY">Permanently closed</option>
              </select>
            </label>
            <label>
              SME classification
              <select value={classification} onChange={(event) => setClassification(event.target.value)}>
                <option value="">Any</option>
                <option value="INDEPENDENT_SME">Independent SME</option>
                <option value="LOCAL_SME_CHAIN">Local SME chain</option>
                <option value="MANUAL_REVIEW">Needs review</option>
                <option value="LARGE_CHAIN">Large chain</option>
                <option value="FRANCHISE_EXCLUDED">Franchise excluded</option>
                <option value="MANUAL_INCLUDE">Manually included</option>
                <option value="MANUAL_EXCLUDE">Manually excluded</option>
              </select>
            </label>
            <label>
              Franchise status
              <select value={franchiseStatus} onChange={(event) => setFranchiseStatus(event.target.value)}>
                <option value="">Any</option>
                <option value="INCLUDED">Include candidates</option>
                <option value="EXCLUDED">Excluded franchises / chains</option>
              </select>
            </label>
            <label>
              Lead status
              <select value={leadStatus} onChange={(event) => setLeadStatus(event.target.value)}>
                <option value="">Any</option>
                <option value="NEW">New</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="READY_TO_CONTACT">Ready to contact</option>
                <option value="CONTACTED">Previously contacted</option>
                <option value="REPLIED">Replied</option>
                <option value="MEETING">Meeting</option>
                <option value="PROPOSAL_SENT">Proposal sent</option>
                <option value="NEGOTIATING">Negotiating</option>
                <option value="WON">Won</option>
                <option value="LOST">Lost</option>
                <option value="NURTURE">Nurture</option>
                <option value="DO_NOT_CONTACT">Do not contact</option>
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
      </form> : null}

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

      {scheduledSearch && showSearchForm ? (
        <div className="scheduled-results-banner">
          <div>
            <strong>Latest scheduled search</strong>
            <span>{scheduledSearch.resultCount} Grade A result{scheduledSearch.resultCount === 1 ? "" : "s"} from {scheduledSearch.zoneLabel} · {new Date(scheduledSearch.completedAt).toLocaleString()}</span>
          </div>
          <Link href="/sme-search/scheduled" className="scheduled-results-button">
            View scheduled results
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : null}

      {results ? (
        <div className="table-actions sme-table-actions">
          <div>
            <SmeScheduledSearchButton settings={scheduledSearchSettings} zones={zones} cities={cities} />
            <button type="button" className="secondary" disabled={selected.length === 0 || findingEmails} onClick={openSmsComposer}>
              Compose SMS{selected.length > 0 ? ` (${selected.length})` : ""}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={selectedProviderPlaceIds.length === 0 || findingEmails}
              onClick={() => setEmailRecipientPlaceIds(selectedProviderPlaceIds)}
              title={selectedProviderPlaceIds.length === 0 ? "Select businesses before composing an email." : "Emails and Do Not Contact status are checked before sending."}
            >
              Compose Email{selected.length > 0 ? ` (${selected.length})` : ""}
            </button>
          </div>
          <div>
            <SmeTableFiltersModal
              filters={tableFilters}
              onApply={(filters) => {
                setTableFilters(filters);
                setCurrentPage(1);
              }}
            />
            <button type="button" className="secondary" disabled={visible.length === 0} onClick={exportVisibleCsv}>Export CSV</button>
          </div>
        </div>
      ) : null}

      {results ? (
        <div className="table-frame">
          <div className="table-scroll sme-results-scroll">
            <table className="sme-results-table">
              <thead>
                <tr>
                  <th
                    className="select-cell"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (selectablePageIds.length > 0) toggleAllOnPage();
                    }}
                  >
                    <span className="checkbox-hit-area">
                      <Checkbox
                        aria-label="Select all results on this page"
                        size="small"
                        checked={allSelected}
                        indeterminate={someSelected}
                        disabled={selectablePageIds.length === 0}
                        onChange={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleAllOnPage();
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            toggleAllOnPage();
                          }
                        }}
                      />
                    </span>
                  </th>
                  <th aria-sort={sort.key === "BUSINESS" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button {...sortButtonProps("BUSINESS", "business")}>
                      Business <SortDirectionIndicator direction={sort.key === "BUSINESS" ? sort.direction : undefined} />
                    </button>
                  </th>
                  <th aria-sort={sort.key === "LOCATION" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button {...sortButtonProps("LOCATION", "location")}>
                      Location <SortDirectionIndicator direction={sort.key === "LOCATION" ? sort.direction : undefined} />
                    </button>
                  </th>
                  <th aria-sort={sort.key === "CONTACT" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button {...sortButtonProps("CONTACT", "contact availability")}>
                      Contact <SortDirectionIndicator direction={sort.key === "CONTACT" ? sort.direction : undefined} />
                    </button>
                  </th>
                  <th aria-sort={sort.key === "SCORE" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button {...sortButtonProps("SCORE", "lead score")}>
                      Score &amp; SME status <SortDirectionIndicator direction={sort.key === "SCORE" ? sort.direction : undefined} />
                    </button>
                  </th>
                  <th aria-sort={sort.key === "LEAD_STATUS" ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                    <button {...sortButtonProps("LEAD_STATUS", "lead status")}>
                      Lead status <SortDirectionIndicator direction={sort.key === "LEAD_STATUS" ? sort.direction : undefined} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                <TableStatusRow colSpan={6} itemCount={visible.length} selectedCount={selected.length} itemLabel="result" />
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      No results. Try a wider radius, another category, or turn off &quot;SME only&quot; to see
                      excluded franchises.
                    </td>
                  </tr>
                ) : (
                  pageResults.map((result) => (
                    <tr
                      key={result.providerPlaceId}
                      className={`clickable-row ${selected.includes(result.providerPlaceId) ? "selected-row" : ""}`}
                      tabIndex={0}
                      onClick={() => setDetail(result)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setDetail(result);
                        }
                      }}
                    >
                      <td
                        className="select-cell"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggle(result.providerPlaceId);
                        }}
                      >
                        <span className="checkbox-hit-area" title={canSelect(result) ? undefined : selectionBlockReason(result)}>
                          <Checkbox
                            aria-label={`Select ${result.displayName}`}
                            size="small"
                            checked={selected.includes(result.providerPlaceId)}
                            disabled={!canSelect(result)}
                            onChange={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggle(result.providerPlaceId);
                            }}
                            onKeyDown={(event) => {
                              event.stopPropagation();
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggle(result.providerPlaceId);
                              }
                            }}
                          />
                        </span>
                      </td>
                      <td className="sme-business-cell">
                        <strong>{result.displayName}</strong>
                        <span>{result.primaryType ?? "Uncategorised"}</span>
                      </td>
                      <td className="sme-location-cell" title={result.formattedAddress ?? undefined}>{result.formattedAddress ?? "—"}</td>
                      <td className="sme-contact-cell">
                        <span className="sme-contact-icons">
                          <span className={result.phoneNumber ? "present" : undefined}>Phone</span>
                          <span className={result.websiteUrl ? "present" : undefined}>Web</span>
                        </span>
                        {result.rating ? <small>{result.rating} ({result.reviewCount ?? 0})</small> : null}
                      </td>
                      <td className="sme-status-cell">
                        <span className={scoreBandPillClassName(result.score.band)}>{result.score.total} · {result.score.band}</span>
                        <span className={smeClassPillClassName(result.classification.effectiveClass)}>
                          {smeClassLabel(result.classification.effectiveClass)}
                        </span>
                      </td>
                      <td className="sme-lead-status-cell">
                        <span className={result.doNotContact || ["LOST", "NURTURE"].includes(result.leadStatus) ? "status-pill status-pill-muted" : "status-pill status-pill-success"}>
                          {leadStatusLabel(result)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {visible.length > 0 ? (
            <div className="table-pagination sme-table-pagination">
              <div className="table-pagination-summary" aria-live="polite">
                <strong>
                  Showing {Math.min((activePage - 1) * pageSize + 1, visible.length)}–{Math.min(activePage * pageSize, visible.length)}
                </strong>
                <span className="muted">of {visible.length} results</span>
              </div>
              <div className="table-pagination-controls">
                <label className="table-page-size">
                  <span>Rows per page</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value) as 20 | 50 | 100 | 200);
                      setCurrentPage(1);
                    }}
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </label>
                <span className="table-page-position">Page {activePage} of {totalPages}</span>
                <button type="button" className="secondary table-page-button" disabled={activePage <= 1} onClick={() => setCurrentPage(activePage - 1)}>
                  Previous
                </button>
                <button type="button" className="secondary table-page-button" disabled={activePage >= totalPages} onClick={() => setCurrentPage(activePage + 1)}>
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
