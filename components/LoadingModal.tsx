"use client";

type LoadingModalProps = {
  label: string;
  message?: string;
  onCancel?: () => void;
};

export function LoadingModal({ label, message = "Please wait while the system finishes this action.", onCancel }: LoadingModalProps) {
  return (
    <div className="modal-backdrop loading-backdrop" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-modal">
        <div className="loading-modal-body">
          <div className="loading-spinner" aria-hidden="true" />
          <h2>{label}</h2>
          <p>{message}</p>
        </div>
        <div className="loading-modal-actions">
          <button type="button" className="bordered-button" onClick={onCancel} disabled={!onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
