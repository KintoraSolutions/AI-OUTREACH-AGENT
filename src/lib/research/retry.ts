import { isRetryable } from "@/lib/research/errors";

/**
 * Retry a function on recoverable failures with bounded exponential backoff
 * (docs/planning/build-plan.md Section 5, requirement 10). Non-recoverable errors are rethrown
 * immediately and never retried. `sleep` is injectable so tests are instant.
 */
export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (attempt: number, error: unknown) => void;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? realSleep;

  let attempt = 0;
  // Total tries = retries + 1.
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !isRetryable(error)) throw error;
      attempt++;
      options.onRetry?.(attempt, error);
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
}
