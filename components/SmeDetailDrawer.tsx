"use client";

import { useState } from "react";
import { ModalHeaderText } from "@/components/ModalHeaderText";
import type { SmeClass } from "@/lib/sme/classify";
import { scoreBandPillClassName, smeClassLabel } from "@/lib/sme/labels";
import type { SmeSearchResult } from "@/lib/sme/run-search";

type SmeDetailDrawerProps = {
  result: SmeSearchResult;
  onClose: () => void;
  onOverridden?: (providerPlaceId: string, effectiveClass: string) => void;
};

const overrideClasses: SmeClass[] = [
  "INDEPENDENT_SME",
  "LOCAL_SME_CHAIN",
  "MANUAL_REVIEW",
  "LARGE_CHAIN",
  "FRANCHISE_EXCLUDED",
  "MANUAL_INCLUDE",
  "MANUAL_EXCLUDE"
];

function readableReasonCode(code: string) {
  return code
    .toLocaleLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(" ");
}

function missingEmailMessage(websiteUrl: string | null) {
  try {
    const url = new URL(websiteUrl || "");
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (["facebook.com", "instagram.com", "tiktok.com", "linkedin.com", "linktr.ee"].some((platform) => host === platform || host.endsWith(`.${platform}`))) {
      return "Not found — this social-platform page may not expose its email to automated checks.";
    }
  } catch {
    // A missing or malformed website is handled by the generic message below.
  }
  return "Not found yet";
}

export function SmeDetailDrawer({ result, onClose, onOverridden }: SmeDetailDrawerProps) {
  const { classification, score } = result;
  const [overrideClass, setOverrideClass] = useState(classification.effectiveClass);
  const [overrideReason, setOverrideReason] = useState("");
  const [overriding, setOverriding] = useState(false);
  const [overrideError, setOverrideError] = useState("");
  // Search completion persists every result as an SME profile, which is the audit record
  // used by the override API. A legacy Lead is optional for outreach, not for review.
  const hasOverrideRecord = Boolean(result.providerPlaceId);

  async function applyOverride() {
    if (!overrideReason.trim() || overriding) return;
    setOverriding(true);
    setOverrideError("");

    const response = await fetch("/api/sme-search/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerPlaceId: result.providerPlaceId,
        effectiveClass: overrideClass,
        reason: overrideReason.trim()
      })
    });
    const payload = await response.json();
    setOverriding(false);

    if (!response.ok) {
      setOverrideError(payload.error?.message || "Unable to change the classification.");
      return;
    }

    onOverridden?.(result.providerPlaceId, overrideClass);
    onClose();
  }

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
                <span>Lead score</span>
                <strong>
                  <span className={scoreBandPillClassName(score.band)}>
                    {score.total}/100 · band {score.band}
                  </span>
                </strong>
              </div>
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
                <span>Email</span>
                <strong title={result.email ?? missingEmailMessage(result.websiteUrl)}>
                  {result.email ? <a href={`mailto:${result.email}`}>{result.email}</a> : missingEmailMessage(result.websiteUrl)}
                </strong>
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
              <div className="sme-evidence-heading">
                <div>
                  <span>Score breakdown</span>
                  <p>How this business reached its lead score.</p>
                </div>
                <span className={scoreBandPillClassName(score.band)}>{score.total}/100</span>
              </div>
              <ul className="sme-reason-list sme-score-breakdown">
                {score.factors.map((factor) => (
                  <li key={factor.key}>
                    <code className="sme-score-factor-label">
                      {factor.label}: {Math.round(factor.points)} / {factor.max}
                      {factor.unknown ? " · partly unknown" : ""}
                    </code>
                    {Array.isArray(factor.evidence)
                      ? factor.evidence.map((line) => <p key={line}>{line}</p>)
                      : null}
                  </li>
                ))}
              </ul>
              <span className="field-note">
                Factors marked &quot;partly unknown&quot; were scored only from evidence we actually
                collected. We never assert a weakness we did not observe — a business with no social
                data is unknown, not weak.
              </span>
            </div>

            <div className="field-group sme-evidence">
              <div className="sme-evidence-heading">
                <div>
                  <span>Why this classification</span>
                  <p>Signals used to classify this business.</p>
                </div>
                <span className="status-pill status-pill-success">{smeClassLabel(classification.effectiveClass)}</span>
              </div>
              <ul className="sme-reason-list sme-classification-reasons">
                {classification.reasons.map((reason) => (
                  <li key={reason.code}>
                    <div className="sme-evidence-card-header">
                      <strong>{readableReasonCode(reason.code)}</strong>
                      <code>{reason.code}</code>
                    </div>
                    <p>{reason.detail}</p>
                  </li>
                ))}
              </ul>
              <span className="field-note">
                Observed locations count only the branches searches have returned so far, so it is a
                floor rather than a true branch count.
              </span>
            </div>

            <div className="field-group sme-evidence">
              <span>Correct this classification</span>
              {!hasOverrideRecord ? (
                <span className="field-note">
                  Save this business first — an override needs a saved record to attach its audit trail
                  to.
                </span>
              ) : (
                <>
                  <div className="sme-search-grid">
                    <label>
                      Set classification to
                      <select
                        value={overrideClass}
                        onChange={(event) => setOverrideClass(event.target.value as SmeClass)}
                      >
                        {overrideClasses.map((item) => (
                          <option key={item} value={item}>
                            {smeClassLabel(item)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Reason (required)
                      <input
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                        placeholder="Independently owned; worth contacting"
                      />
                    </label>
                  </div>
                  {overrideError ? <p className="sme-send-error">{overrideError}</p> : null}
                  <div className="settings-template-helper">
                    <button
                      type="button"
                      className="secondary compact-button"
                      onClick={applyOverride}
                      disabled={overriding || !overrideReason.trim() || overrideClass === classification.effectiveClass}
                    >
                      {overriding ? "Saving…" : "Apply override"}
                    </button>
                    <span className="field-note">
                      The automatic classification is kept. Who changed it, when, from what and why are
                      all recorded.
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="compose-modal-actions">
            <span />
            <div className="compose-modal-action-group">
              {result.googleMapsUri ? (
                <a className="button primary-button" href={result.googleMapsUri} target="_blank" rel="noreferrer noopener">
                  Open in Google Maps
                </a>
              ) : null}
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
