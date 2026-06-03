"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { getCityCoordinates, philippinesLocations, provinces, type Province } from "@/lib/philippines-locations";

const nearbyBusinessTypes = [
  { value: "", label: "Any" },
  { value: "restaurant", label: "Restaurant" },
  { value: "doctor", label: "Clinic / Doctor" },
  { value: "dentist", label: "Dental Clinic" },
  { value: "veterinary_care", label: "Veterinary Clinic" },
  { value: "pet_store", label: "Pet Store" },
  { value: "beauty_salon", label: "Beauty Salon" },
  { value: "spa", label: "Spa" },
  { value: "gym", label: "Gym" },
  { value: "store", label: "Retail Store" },
  { value: "real_estate_agency", label: "Real Estate Agency" },
  { value: "accounting", label: "Accounting Firm" },
  { value: "lawyer", label: "Law Office" }
];

export function SearchForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<"TEXT_SEARCH" | "NEARBY_SEARCH">("TEXT_SEARCH");
  const [province, setProvince] = useState<Province>("NCR");
  const [cityArea, setCityArea] = useState("Makati");

  const cities = philippinesLocations[province];

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    const coordinates = getCityCoordinates(cityArea);
    const response = await fetch("/api/places/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        country: "Philippines",
        cityArea,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        maxResults: Number(payload.maxResults || 10),
        radius: Number(payload.radius || 1000)
      })
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      setError(data.error?.message || "Search failed. Please try again.");
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({
      searchStatus: "success",
      found: String(data.data.totalFound ?? 0),
      saved: String(data.data.totalSaved ?? 0),
      duplicates: String(data.data.totalDuplicates ?? 0)
    });
    router.push(`/leads?${params.toString()}`);
    setLoading(false);
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      {loading ? <LoadingModal label="Collecting leads" /> : null}
      <h2 className="panel-title">Search Collection</h2>
      <div className="grid">
        <label>
          Province / Region
          <select
            name="province"
            value={province}
            onChange={(event) => {
              const nextProvince = event.target.value as Province;
              setProvince(nextProvince);
              setCityArea(philippinesLocations[nextProvince][0]);
            }}
          >
            {provinces.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          City
          <select name="cityArea" value={cityArea} onChange={(event) => setCityArea(event.target.value)} required>
            {cities.map((city) => (
              <option key={city} value={city}>{city}</option>
            ))}
          </select>
        </label>
        <label>
          Search Type
          <select
            name="searchType"
            value={searchType}
            onChange={(event) => setSearchType(event.target.value as "TEXT_SEARCH" | "NEARBY_SEARCH")}
          >
            <option value="TEXT_SEARCH">Text Search</option>
            <option value="NEARBY_SEARCH">Nearby Search</option>
          </select>
        </label>
        {searchType === "TEXT_SEARCH" ? (
          <label>
            Keyword
            <input name="keyword" defaultValue="accounting firm" required />
          </label>
        ) : null}
        {searchType === "NEARBY_SEARCH" ? (
          <>
            <label>
              Business Type
              <select name="includedType" defaultValue="">
                {nearbyBusinessTypes.map((type) => (
                  <option key={type.value} value={type.value}>{type.label}</option>
                ))}
              </select>
            </label>
            <label>
              Radius (m)
              <input name="radius" type="number" min="100" max="50000" defaultValue="1000" required />
            </label>
          </>
        ) : null}
        <label>
          Max Results
          <input name="maxResults" type="number" min="1" max="60" defaultValue="10" />
        </label>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
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
      {error ? <p className="notice notice-error">{error}</p> : null}
    </form>
  );
}
