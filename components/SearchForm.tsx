"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import { Snackbar } from "@/components/Snackbar";
import { getCityCoordinates } from "@/lib/philippines-locations";
import { fixedSearchCities, petClinicKeywords, skinClinicKeywords } from "@/lib/search-defaults";

export function SearchForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSearchInfo, setShowSearchInfo] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const maxResults = Math.min(Number(payload.maxResults || 30), 30);
    const petMaxResults = Math.ceil(maxResults / 2);
    const skinMaxResults = Math.floor(maxResults / 2);
    const searches = [
      { keyword: randomItem(petClinicKeywords), maxResults: petMaxResults },
      { keyword: randomItem(skinClinicKeywords), maxResults: skinMaxResults }
    ].filter((search) => search.maxResults > 0);

    let searchCount = 0;
    for (const search of searches) {
      const cityArea = randomItem(fixedSearchCities);
      const coordinates = getCityCoordinates(cityArea);
      const response = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: "Philippines",
          cityArea,
          searchType: "TEXT_SEARCH",
          keyword: search.keyword,
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          maxResults: search.maxResults,
          radius: 1000
        })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        setError(data.error?.message || "Search failed. Please try again.");
        setLoading(false);
        return;
      }
      searchCount += Number(data.data?.totalSaved ?? 0);
    }
    const params = new URLSearchParams({
      searchStatus: "success",
      searchCount: String(searchCount),
      searchToastId: String(Date.now())
    });
    router.push(`/leads?${params.toString()}`);
    setLoading(false);
  }

  return (
    <form className="panel settings-panel search-collection-panel" onSubmit={onSubmit}>
      {loading ? <LoadingModal label="Collecting leads" /> : null}
      {error ? <Snackbar message={error} type="error" onDismiss={() => setError("")} /> : null}
      <div className="settings-panel-body">
        <div className="search-collection-header">
          <h2 className="panel-title">Search Collection</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Show fixed search parameters"
            onClick={() => setShowSearchInfo(true)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01" />
              <path d="M11 12h1v5h1" />
            </svg>
          </button>
        </div>
        <div className="grid fixed-search-grid">
          <label>
            Max Results
            <input name="maxResults" type="number" min="1" max="30" defaultValue="30" />
          </label>
        </div>
      </div>
      <div className="settings-panel-footer">
        <button type="submit" disabled={loading}>
          <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M21 21l-4.3-4.3" />
            <circle cx="11" cy="11" r="7" />
            <path d="M11 8v6" />
            <path d="M8 11h6" />
          </svg>
          {loading ? "Collecting..." : "Collect Leads"}
        </button>
      </div>
      {showSearchInfo ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowSearchInfo(false)}>
          <div className="compose-modal search-info-modal" role="dialog" aria-modal="true" aria-labelledby="search-info-title" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-header">
              <ModalHeaderText
                id="search-info-title"
                title="Fixed search parameters"
                subtitle="Search Collection uses fixed defaults for faster lead gathering."
              />
              <button type="button" className="icon-button" aria-label="Close fixed search info" onClick={() => setShowSearchInfo(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="search-info-modal-body">
              <div className="fixed-search-info">
                <span>Cities</span>
                <p>Pasig, Mandaluyong, Makati, and Taguig.</p>
              </div>
              <div className="fixed-search-info">
                <span>Keywords</span>
                <p>Pet clinic, veterinary clinic, animal clinic, skin clinic, dermatology clinic, and aesthetic clinic.</p>
              </div>
              <div className="fixed-search-info">
                <span>Search type</span>
                <p>Text Search. Each collection run balances one pet clinic search and one skin clinic search across the fixed cities.</p>
              </div>
            </div>
            <div className="compose-modal-actions">
              <span />
              <button type="button" onClick={() => setShowSearchInfo(false)}>OK</button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function randomItem<T>(items: readonly T[]) {
  return items[Math.floor(Math.random() * items.length)];
}
