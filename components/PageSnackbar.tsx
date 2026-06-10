"use client";

import { useEffect } from "react";
import { useState } from "react";
import { Snackbar } from "@/components/Snackbar";

type PageSnackbarProps = {
  message: string;
  type?: "success" | "error";
  clearParams?: string[];
  triggerKey?: string;
};

export function PageSnackbar({ message, type = "success", clearParams = [], triggerKey }: PageSnackbarProps) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    setVisible(Boolean(message));
  }, [message, triggerKey]);

  useEffect(() => {
    if (clearParams.length === 0) return;
    const url = new URL(window.location.href);
    let changed = false;
    for (const param of clearParams) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [clearParams]);

  if (!visible) return null;

  return <Snackbar message={message} type={type} onDismiss={() => setVisible(false)} />;
}
