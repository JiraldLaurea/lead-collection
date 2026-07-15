"use client";

import { useState } from "react";
import { Snackbar } from "@/components/Snackbar";

export function ScheduledSearchCompletionToast() {
  const [visible, setVisible] = useState(true);
  return visible ? <Snackbar message="Scheduled SME search completed. Review the qualified results below." type="success" onDismiss={() => setVisible(false)} /> : null;
}
