"use client";

import { useState } from "react";
import { formatCategoryLabel } from "@/lib/format";
import type { LeadFilters } from "@/lib/leads";
import { fixedSearchCities } from "@/lib/search-defaults";

type LeadFiltersFormProps = {
  filters: LeadFilters;
  categories: string[];
  websiteFilterValue: string;
  phoneFilterValue: string;
  emailFilterValue: string;
  variant?: "panel" | "plain";
};

export function LeadFiltersForm({ filters, categories, websiteFilterValue, phoneFilterValue, emailFilterValue, variant = "panel" }: LeadFiltersFormProps) {
  const [area, setArea] = useState(fixedSearchCities.includes(filters.area as typeof fixedSearchCities[number]) ? filters.area ?? "" : "");

  return (
    <div className={`${variant === "panel" ? "panel " : ""}grid leads-filter-form`}>
      <label>
        City
        <select name="area" value={area} onChange={(event) => setArea(event.target.value)}>
          <option value="">Any city</option>
          {fixedSearchCities.map((city) => (
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
      <label>Email<select name="hasEmail" defaultValue={emailFilterValue}><option value="">Any</option><option value="true">Has email</option><option value="false">No email</option></select></label>
    </div>
  );
}
