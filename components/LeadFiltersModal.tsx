"use client";

import { useState } from "react";
import { LeadFiltersForm } from "@/components/LeadFiltersForm";
import type { LeadFilters } from "@/lib/leads";

type LeadFiltersModalProps = {
  filters: LeadFilters;
  categories: string[];
  websiteFilterValue: string;
  phoneFilterValue: string;
};

export function LeadFiltersModal({ filters, categories, websiteFilterValue, phoneFilterValue }: LeadFiltersModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>
        <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
        Show filters
      </button>
      {open ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lead-filters-title"
          onClick={() => setOpen(false)}
        >
          <div className="compose-modal filter-modal" onClick={(event) => event.stopPropagation()}>
            <div className="compose-modal-scroll">
              <div className="compose-modal-header">
                <h2 id="lead-filters-title">Lead filters</h2>
                <button type="button" className="icon-button" aria-label="Close filters modal" onClick={() => setOpen(false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <LeadFiltersForm
                filters={filters}
                categories={categories}
                websiteFilterValue={websiteFilterValue}
                phoneFilterValue={phoneFilterValue}
                variant="plain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
