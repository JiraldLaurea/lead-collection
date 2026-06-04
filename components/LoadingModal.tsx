"use client";

type LoadingModalProps = {
  label: string;
};

export function LoadingModal({ label }: LoadingModalProps) {
  return (
    <div className="modal-backdrop loading-backdrop" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-modal">
        <div className="loading-spinner" aria-hidden="true" />
        <p>{label}</p>
      </div>
    </div>
  );
}
