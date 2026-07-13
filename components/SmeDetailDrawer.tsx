"use client";

import { ModalHeaderText } from "@/components/ModalHeaderText";
import { smeClassLabel } from "@/lib/sme/labels";
import type { SmeSearchResult } from "@/lib/sme/run-search";

type SmeDetailDrawerProps = {
  result: SmeSearchResult;
  onClose: () => void;
};

export function SmeDetailDrawer({ result, onClose }: SmeDetailDrawerProps) {
  const { classification } = result;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="compose-modal sme-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sme-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="compose-modal-scroll">
          <div className="compose-modal-header">
            <ModalHeaderText
              id="sme-detail-title"
              title={result.displayName}
              subtitle={result.formattedAddress ?? "No address recorded"}
            />
            <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          <div className="compose-modal-body">
            <div className="detail-list">
              <div className="detail-row">
                <span>SME classification</span>
                <strong>{smeClassLabel(classification.effectiveClass)}</strong>
              </div>
              <div className="detail-row">
                <span>Confidence</span>
                <strong>{classification.confidence}%</strong>
              </div>
              <div className="detail-row">
                <span>Observed locations</span>
                <strong>{classification.branchCount || 1}</strong>
              </div>
              {classification.matchedBrandName ? (
                <div className="detail-row">
                  <span>Matched franchise</span>
                  <strong>{classification.matchedBrandName}</strong>
                </div>
              ) : null}
              <div className="detail-row">
                <span>Category</span>
                <strong>{result.primaryType ?? "—"}</strong>
              </div>
              <div className="detail-row">
                <span>Rating</span>
                <strong>
                  {result.rating ? `${result.rating} (${result.reviewCount ?? 0} reviews)` : "No rating"}
                </strong>
              </div>
              <div className="detail-row">
                <span>Phone</span>
                <strong>{result.phoneNumber ?? "Not published"}</strong>
              </div>
              <div className="detail-row">
                <span>Website</span>
                <strong>
                  {result.websiteUrl ? (
                    <a href={result.websiteUrl} target="_blank" rel="noreferrer noopener">
                      {result.websiteHost ?? result.websiteUrl}
                    </a>
                  ) : (
                    "None found"
                  )}
                </strong>
              </div>
              <div className="detail-row">
                <span>Business status</span>
                <strong>{result.businessStatus ?? "—"}</strong>
              </div>
              <div className="detail-row">
                <span>Already saved</span>
                <strong>{result.savedLeadId ? `Yes (lead #${result.savedLeadId})` : "No"}</strong>
              </div>
              <div className="detail-row">
                <span>Source</span>
                <strong>Google Places · fetched just now</strong>
              </div>
            </div>

            <div className="field-group sme-evidence">
              <span>Why this classification</span>
              <ul className="sme-reason-list">
                {classification.reasons.map((reason) => (
                  <li key={reason.code}>
                    <code>{reason.code}</code>
                    <p>{reason.detail}</p>
                  </li>
                ))}
              </ul>
              <span className="field-note">
                Observed locations count only the branches searches have returned so far, so it is a
                floor rather than a true branch count.
              </span>
            </div>
          </div>

          <div className="compose-modal-actions">
            <span />
            <div className="compose-modal-action-group">
              {result.googleMapsUri ? (
                <a className="button secondary" href={result.googleMapsUri} target="_blank" rel="noreferrer noopener">
                  Open in Google Maps
                </a>
              ) : null}
              <button type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
