/**
 * Per-domain rate limiter. Enforces a minimum interval between requests to the
 * same host (docs/planning/build-plan.md Section 6, requirement 11). The clock and sleep functions
 * are injectable so tests run deterministically without real delays.
 */

export interface RateLimiterOptions {
  /** Minimum ms between requests to the same host. */
  defaultIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class DomainRateLimiter {
  private readonly last = new Map<string, number>();
  private readonly perHostInterval = new Map<string, number>();
  private readonly defaultIntervalMs: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: RateLimiterOptions = {}) {
    this.defaultIntervalMs = options.defaultIntervalMs ?? 1500;
    this.now = options.now ?? (() => Date.now());
    this.sleep = options.sleep ?? realSleep;
  }

  /** Set a host-specific minimum interval, e.g. from robots crawl-delay. */
  setInterval(host: string, intervalMs: number): void {
    this.perHostInterval.set(host, Math.max(intervalMs, this.defaultIntervalMs));
  }

  /** Wait until the host is allowed to be requested again, then reserve a slot. */
  async wait(host: string): Promise<void> {
    const interval = this.perHostInterval.get(host) ?? this.defaultIntervalMs;
    const last = this.last.get(host);
    const current = this.now();
    if (last !== undefined) {
      const elapsed = current - last;
      if (elapsed < interval) {
        await this.sleep(interval - elapsed);
      }
    }
    this.last.set(host, this.now());
  }
}
