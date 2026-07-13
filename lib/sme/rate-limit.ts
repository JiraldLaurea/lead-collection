/**
 * In-process rate limit for SME searches (work order 10.2).
 *
 * Every search costs real Google Places requests, so a runaway client — a retry loop, a stuck
 * key, an impatient user hammering Search — spends money. This caps the burn.
 *
 * Deliberately in-memory: the app runs as a single Node process, and pulling in Redis for a
 * counter would be the only reason to add it. If the app is ever scaled to several instances,
 * this becomes per-instance and should move to a shared store — noted in the known limitations.
 */
type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function checkRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  const existing = windows.get(key);

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
}

/** Test-only: drops all counters. */
export function resetRateLimits() {
  windows.clear();
}

export const searchRateLimit = {
  /** A minute's worth of deliberate searching, not a script. */
  perMinute: 10,
  /** A working day's worth of searching; beyond this, something is wrong. */
  perHour: 100
};

export function checkSearchRateLimit(now = Date.now()) {
  const minute = checkRateLimit("sme-search:minute", searchRateLimit.perMinute, 60_000, now);
  if (!minute.allowed) return minute;
  return checkRateLimit("sme-search:hour", searchRateLimit.perHour, 3_600_000, now);
}
