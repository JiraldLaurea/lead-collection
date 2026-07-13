"use client";

import { useState } from "react";

export type SmsLogFilters = {
  from: string;
  to: string;
  businessName: string;
  phone: string;
  provider: string;
  status: string;
  deliveryStatus: string;
};

type SmsLogFiltersModalProps = {
  filters: SmsLogFilters;
};

export function SmsLogFiltersModal({ filters }: SmsLogFiltersModalProps) {
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
          aria-labelledby="sms-log-filters-title"
          onClick={() => setOpen(false)}
        >
          <div className="compose-modal filter-modal" onClick={(event) => event.stopPropagation()}>
            <form className="compose-modal-scroll">
              <div className="compose-modal-header">
                <h2 id="sms-log-filters-title">SMS log filters</h2>
                <button type="button" className="icon-button" aria-label="Close filters modal" onClick={() => setOpen(false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid email-log-filter-form">
                <label>
                  From
                  <input name="from" type="date" defaultValue={filters.from} />
                </label>
                <label>
                  To
                  <input name="to" type="date" defaultValue={filters.to} />
                </label>
                <label>
                  Business name
                  <input name="businessName" placeholder="All businesses" defaultValue={filters.businessName} />
                </label>
                <label>
                  Phone
                  <input name="phone" placeholder="Any phone" defaultValue={filters.phone} />
                </label>
                <label>
                  Provider
                  <input name="provider" placeholder="Any provider" defaultValue={filters.provider} />
                </label>
                <label>
                  Status
                  <select name="status" defaultValue={filters.status}>
                    <option value="">Any status</option>
                    <option value="sent">Sent</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                  </select>
                </label>
                <label>
                  Delivery
                  <input name="deliveryStatus" placeholder="DELIVRD, UNDELIV, etc." defaultValue={filters.deliveryStatus} />
                </label>
              </div>
              <div className="compose-modal-actions">
                <span />
                <div className="compose-modal-action-group">
                  <a className="button secondary" href="/sms-log">
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 3-6.7" />
                      <path d="M3 4v5h5" />
                    </svg>
                    Reset
                  </a>
                  <button type="submit">
                    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 5h16" />
                      <path d="M7 12h10" />
                      <path d="M10 19h4" />
                    </svg>
                    Apply filters
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
