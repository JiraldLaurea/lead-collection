import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, checkSearchRateLimit, resetRateLimits, searchRateLimit } from "@/lib/sme/rate-limit";

describe("search rate limiting", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests up to the limit", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(checkRateLimit("k", 3, 60_000, 1000).allowed).toBe(true);
    }
  });

  it("blocks the request after the limit and reports when to retry", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      checkRateLimit("k", 3, 60_000, 1000);
    }

    const blocked = checkRateLimit("k", 3, 60_000, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("lets requests through again once the window rolls over", () => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      checkRateLimit("k", 3, 60_000, 1000);
    }
    expect(checkRateLimit("k", 3, 60_000, 1000).allowed).toBe(false);

    // A minute later.
    expect(checkRateLimit("k", 3, 60_000, 62_000).allowed).toBe(true);
  });

  it("keeps separate counters per key", () => {
    checkRateLimit("a", 1, 60_000, 1000);
    expect(checkRateLimit("a", 1, 60_000, 1000).allowed).toBe(false);
    expect(checkRateLimit("b", 1, 60_000, 1000).allowed).toBe(true);
  });

  it("caps SME searches per minute, because each one spends money at Google", () => {
    for (let attempt = 1; attempt <= searchRateLimit.perMinute; attempt += 1) {
      expect(checkSearchRateLimit(1000).allowed).toBe(true);
    }
    expect(checkSearchRateLimit(1000).allowed).toBe(false);
  });

  it("also caps searches per hour, so a paced loop cannot drain the budget", () => {
    // Someone (or something) searching at exactly the per-minute limit, minute after minute.
    let allowed = 0;
    for (let minute = 0; minute < 12; minute += 1) {
      for (let attempt = 0; attempt < searchRateLimit.perMinute; attempt += 1) {
        const now = 1000 + minute * 61_000 + attempt * 100;
        if (checkSearchRateLimit(now).allowed) allowed += 1;
      }
    }

    // 12 minutes x 10/min would be 120, but the hourly cap stops it at 100.
    expect(allowed).toBe(searchRateLimit.perHour);
  });
});
