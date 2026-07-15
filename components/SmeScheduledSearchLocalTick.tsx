"use client";

import { useEffect } from "react";

/** Keeps the configured schedule alive on a locally running app, using the same browser-wake model as local email automation. */
export function SmeScheduledSearchLocalTick() {
  useEffect(() => {
    let active = true;
    async function tick() {
      try {
        await fetch("/api/sme-search/schedule/tick", { cache: "no-store" });
      } catch {
        // The next wake-up will retry. This only affects the local fallback.
      }
    }
    void tick();
    const interval = window.setInterval(() => { if (active) void tick(); }, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
