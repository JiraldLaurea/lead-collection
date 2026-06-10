"use client";

import { useEffect } from "react";

type SnackbarProps = {
  message: string;
  type?: "success" | "error";
  onDismiss: () => void;
};

export function Snackbar({ message, type = "success", onDismiss }: SnackbarProps) {
  useEffect(() => {
    const timeout = window.setTimeout(onDismiss, 4200);
    return () => window.clearTimeout(timeout);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className={`snackbar snackbar-${type}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss notification">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>
    </div>
  );
}
