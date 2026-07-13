"use client";

import { useRef, useState } from "react";
import { LoadingModal } from "@/components/LoadingModal";
import { SettingPanelHeader } from "@/components/SettingPanelHeader";
import { Snackbar } from "@/components/Snackbar";
import type { ChainThresholds } from "@/lib/sme/classify";
import type { ScoreWeights } from "@/lib/sme/score";

type ImportKind = "zones" | "franchise";

type ImportOutcome = {
  kind: ImportKind;
  dryRun: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
};

type SmeSettingsFormProps = {
  enabled: boolean;
  weights: ScoreWeights;
  thresholds: ChainThresholds;
  zoneCount: number;
  brandCount: number;
};

const weightFields: { key: keyof ScoreWeights; label: string }[] = [
  { key: "smeConfidence", label: "SME confidence" },
  { key: "marketingNeed", label: "Marketing need" },
  { key: "businessPotential", label: "Business potential" },
  { key: "contactAvailability", label: "Contact availability" },
  { key: "areaValue", label: "Commercial area value" }
];

export function SmeSettingsForm({ enabled, weights, thresholds, zoneCount, brandCount }: SmeSettingsFormProps) {
  const [featureEnabled, setFeatureEnabled] = useState(enabled);
  const [scoreWeights, setScoreWeights] = useState(weights);
  const [chainThresholds, setChainThresholds] = useState(thresholds);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error">("success");
  const zoneInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);

  const total =
    scoreWeights.smeConfidence +
    scoreWeights.marketingNeed +
    scoreWeights.businessPotential +
    scoreWeights.contactAvailability +
    scoreWeights.areaValue;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setNotice("");

    const response = await fetch("/api/settings/sme", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: featureEnabled, weights: scoreWeights, thresholds: chainThresholds })
    });
    const payload = await response.json();
    setSaving(false);

    if (response.ok) {
      setNoticeType("success");
      setNotice("SME Search settings saved.");
      return;
    }
    setNoticeType("error");
    setNotice(payload.error?.message || "Unable to save SME Search settings.");
  }

  async function runImport(kind: ImportKind, file: File, dryRun: boolean) {
    setImporting(true);
    setOutcome(null);
    setNotice("");

    const formData = new FormData();
    formData.append("kind", kind);
    formData.append("file", file);
    formData.append("dryRun", dryRun ? "true" : "false");

    const response = await fetch("/api/sme-search/imports", { method: "POST", body: formData });
    const payload = await response.json();
    setImporting(false);

    if (!response.ok) {
      setNoticeType("error");
      setNotice(payload.error?.message || "The CSV could not be imported.");
      return;
    }

    setOutcome(payload.data);
    if (!dryRun) {
      setNoticeType("success");
      setNotice(`${kind === "zones" ? "Search zones" : "Franchise brands"} imported.`);
    }
  }

  function handleFile(kind: ImportKind, input: HTMLInputElement | null, dryRun: boolean) {
    const file = input?.files?.[0];
    if (!file) {
      setNoticeType("error");
      setNotice("Choose a CSV file first.");
      return;
    }
    runImport(kind, file, dryRun);
  }

  return (
    <form className="panel settings-panel" onSubmit={save}>
      {saving ? <LoadingModal label="Saving SME settings" /> : null}
      {importing ? <LoadingModal label="Importing CSV" /> : null}
      {notice ? <Snackbar message={notice} type={noticeType} onDismiss={() => setNotice("")} /> : null}

      <div className="settings-panel-body">
        <SettingPanelHeader
          title="SME Search"
          subtitle="Enable the feature, tune the scoring model, and manage the franchise blacklist and commercial roads."
        />

        <label className="switch-field">
          <input type="checkbox" checked={featureEnabled} onChange={(event) => setFeatureEnabled(event.target.checked)} />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>Show SME Search in the sidebar</span>
        </label>

        <div className="field-group">
          <span>Lead scoring weights</span>
          <div className="sme-search-grid">
            {weightFields.map((field) => (
              <label key={field.key}>
                {field.label}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scoreWeights[field.key]}
                  onChange={(event) =>
                    setScoreWeights((current) => ({ ...current, [field.key]: Number(event.target.value) }))
                  }
                />
              </label>
            ))}
          </div>
          <span className={total === 100 ? "field-note" : "sme-weight-warning"}>
            Total: {total}/100.{" "}
            {total === 100
              ? "Scores are out of 100, so the bands stay comparable across searches."
              : "Weights must add up to 100 before you can save."}
          </span>
        </div>

        <div className="field-group">
          <span>Chain thresholds</span>
          <div className="sme-search-grid">
            <label>
              Local chain up to
              <input
                type="number"
                min={1}
                max={50}
                value={chainThresholds.localChainMax}
                onChange={(event) =>
                  setChainThresholds((current) => ({ ...current, localChainMax: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Manual review up to
              <input
                type="number"
                min={1}
                max={100}
                value={chainThresholds.manualReviewMax}
                onChange={(event) =>
                  setChainThresholds((current) => ({ ...current, manualReviewMax: Number(event.target.value) }))
                }
              />
            </label>
          </div>
          <span className="field-note">
            Businesses with more observed locations than the manual-review ceiling are treated as large
            chains and excluded by default. A locally owned business with a few branches is a
            high-value prospect, so keep the local-chain ceiling generous.
          </span>
        </div>

        <div className="field-group">
          <span>Commercial roads ({zoneCount} configured)</span>
          <input ref={zoneInputRef} className="file-upload-input" type="file" accept=".csv" />
          <div className="settings-template-helper">
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => handleFile("zones", zoneInputRef.current, true)}
              disabled={importing}
            >
              Dry run
            </button>
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => handleFile("zones", zoneInputRef.current, false)}
              disabled={importing}
            >
              Import zones
            </button>
          </div>
          <span className="field-note">Template: docs/templates/search-zones-template.csv</span>
        </div>

        <div className="field-group">
          <span>Franchise blacklist ({brandCount} brands)</span>
          <input ref={brandInputRef} className="file-upload-input" type="file" accept=".csv" />
          <div className="settings-template-helper">
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => handleFile("franchise", brandInputRef.current, true)}
              disabled={importing}
            >
              Dry run
            </button>
            <button
              type="button"
              className="secondary compact-button"
              onClick={() => handleFile("franchise", brandInputRef.current, false)}
              disabled={importing}
            >
              Import brands
            </button>
          </div>
          <span className="field-note">
            Template: docs/templates/franchise-brands-template.csv. Review the list before importing —
            an over-broad brand rule silently excludes real prospects.
          </span>
        </div>

        {outcome ? (
          <div className="field-group">
            <span>{outcome.dryRun ? "Dry run result (nothing was written)" : "Import result"}</span>
            <p className="field-note">
              {outcome.created} new · {outcome.updated} updated · {outcome.unchanged} unchanged ·{" "}
              {outcome.errors.length} row error{outcome.errors.length === 1 ? "" : "s"}
            </p>
            {outcome.errors.length > 0 ? (
              <ul className="sme-reason-list">
                {outcome.errors.slice(0, 10).map((error) => (
                  <li key={`${error.row}-${error.message}`}>
                    <code>Row {error.row}</code>
                    <p>{error.message}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="settings-panel-footer">
        <span className="field-note">Scoring changes apply to the next search; saved scores are never rewritten.</span>
        <button type="submit" disabled={saving || total !== 100}>
          Save SME settings
        </button>
      </div>
    </form>
  );
}
