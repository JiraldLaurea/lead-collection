"use client";

import { useState } from "react";

export type SmeTableFilters = {
  query: string;
  contact: "" | "PHONE" | "EMAIL" | "WEBSITE";
  scoreBand: "" | "S" | "A" | "B" | "C";
  classification: string;
  leadStatus: "" | "NEW" | "QUALIFIED" | "READY_TO_CONTACT" | "CONTACTED" | "REPLIED" | "MEETING" | "PROPOSAL_SENT" | "NEGOTIATING" | "WON" | "LOST" | "NURTURE" | "DO_NOT_CONTACT";
};

export const emptySmeTableFilters: SmeTableFilters = {
  query: "",
  contact: "",
  scoreBand: "",
  classification: "",
  leadStatus: ""
};

type SmeTableFiltersModalProps = {
  filters: SmeTableFilters;
  onApply: (filters: SmeTableFilters) => void;
};

export function SmeTableFiltersModal({ filters, onApply }: SmeTableFiltersModalProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SmeTableFilters>(filters);

  function update<K extends keyof SmeTableFilters>(key: K, value: SmeTableFilters[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <>
      <button
        type="button"
        className="secondary"
        onClick={() => {
          setDraft(filters);
          setOpen(true);
        }}
      >
        <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
        Show filters
      </button>
      {open ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sme-table-filters-title" onClick={() => setOpen(false)}>
          <form
            className="compose-modal filter-modal"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              onApply({ ...draft, query: draft.query.trim() });
              setOpen(false);
            }}
          >
            <div className="compose-modal-header">
              <div>
                <h2 id="sme-table-filters-title">SME table filters</h2>
                <p>Filter the results already shown in this table.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close SME table filters" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <div className="grid sme-table-filter-form">
              <label className="sme-table-filter-query">
                Business or location
                <input value={draft.query} placeholder="Search the current results" onChange={(event) => update("query", event.target.value)} />
              </label>
              <label>
                Contact available
                <select value={draft.contact} onChange={(event) => update("contact", event.target.value as SmeTableFilters["contact"])}>
                  <option value="">Any</option>
                  <option value="PHONE">Has phone</option>
                  <option value="EMAIL">Has email</option>
                  <option value="WEBSITE">Has website</option>
                </select>
              </label>
              <label>
                Score band
                <select value={draft.scoreBand} onChange={(event) => update("scoreBand", event.target.value as SmeTableFilters["scoreBand"])}>
                  <option value="">Any</option>
                  <option value="S">S</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </label>
              <label>
                SME classification
                <select value={draft.classification} onChange={(event) => update("classification", event.target.value)}>
                  <option value="">Any</option>
                  <option value="INDEPENDENT_SME">Independent</option>
                  <option value="LOCAL_SME_CHAIN">Local chain</option>
                  <option value="MANUAL_INCLUDE">Manually included</option>
                  <option value="MANUAL_REVIEW">Needs review</option>
                  <option value="FRANCHISE_EXCLUDED">Excluded franchise</option>
                  <option value="LARGE_CHAIN">Large chain</option>
                </select>
              </label>
              <label>
                Lead status
                <select value={draft.leadStatus} onChange={(event) => update("leadStatus", event.target.value as SmeTableFilters["leadStatus"])}>
                  <option value="">Any</option>
                  <option value="NEW">New</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="READY_TO_CONTACT">Ready to contact</option>
                  <option value="CONTACTED">Contacted</option>
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
            <div className="compose-modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  onApply(emptySmeTableFilters);
                  setDraft(emptySmeTableFilters);
                  setOpen(false);
                }}
              >
                Clear filters
              </button>
              <button type="submit">Apply filters</button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
