"use client";

import { useState } from "react";
import { formatCategoryLabel } from "@/lib/format";
import type { LeadFilters } from "@/lib/leads";
import { getProvinceForCity, philippinesLocations, provinces, type Province } from "@/lib/philippines-locations";

type LeadFiltersFormProps = {
  filters: LeadFilters;
  categories: string[];
  websiteFilterValue: string;
  phoneFilterValue: string;
  variant?: "panel" | "plain";
};

export function LeadFiltersForm({ filters, categories, websiteFilterValue, phoneFilterValue, variant = "panel" }: LeadFiltersFormProps) {
  const [province, setProvince] = useState<Province>(getProvinceForCity(filters.area));
  const [area, setArea] = useState(filters.area ?? "");
  const cities = philippinesLocations[province];

  return (
    <form className={`${variant === "panel" ? "panel " : ""}grid leads-filter-form`}>
      <label>Keyword<input name="keyword" placeholder="accounting firm" defaultValue={filters.keyword} /></label>
      <label>
        Province / Region
        <select
          name="province"
          value={province}
          onChange={(event) => {
            const nextProvince = event.target.value as Province;
            setProvince(nextProvince);
            setArea("");
          }}
        >
          {provinces.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        City
        <select name="area" value={area} onChange={(event) => setArea(event.target.value)}>
          <option value="">Any city</option>
          {cities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </label>
      <label>
        Category
        <select name="category" defaultValue={filters.category ?? ""}>
          <option value="">Any category</option>
          {categories.map((category) => (
            <option key={category} value={category}>{formatCategoryLabel(category)}</option>
          ))}
        </select>
      </label>
      <label>Minimum Rating<input name="minRating" type="number" min="0" max="5" step="0.1" placeholder="4.5" defaultValue={filters.minRating} /></label>
      <label>Website<select name="hasWebsite" defaultValue={websiteFilterValue}><option value="">Any</option><option value="true">Has website</option><option value="false">No website</option></select></label>
      <label>Phone<select name="hasPhone" defaultValue={phoneFilterValue}><option value="">Any</option><option value="true">Has phone</option><option value="false">No phone</option></select></label>
      <button type="submit">
        <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
        Apply Filters
      </button>
    </form>
  );
}
