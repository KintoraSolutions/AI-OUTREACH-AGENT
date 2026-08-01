/**
 * Typed errors for the research engine.
 *
 * The distinction between recoverable and non-recoverable failures drives the
 * retry and failure-isolation behavior in the pipeline (plan.md Section 5):
 * transient problems are retried with backoff; permanent ones are recorded and
 * skipped without stopping the campaign.
 */

/** Thrown when a provider is used but its credentials are not configured. */
export class ProviderNotConfiguredError extends Error {
  readonly requiredEnv: string[];
  constructor(provider: string, requiredEnv: string[]) {
    super(
      `${provider} is not configured. Set ${requiredEnv.join(", ")} to enable it.`,
    );
    this.name = "ProviderNotConfiguredError";
    this.requiredEnv = requiredEnv;
  }
}

/** A transient failure worth retrying (network error, 5xx, timeout, 429). */
export class RecoverableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RecoverableError";
  }
}

/**
 * A permanent failure that must not be retried and must never be bypassed:
 * robots.txt disallow, login/CAPTCHA wall, 401/403/404, or an unsafe URL.
 */
export class NonRecoverableError extends Error {
  readonly reason: NonRecoverableReason;
  constructor(reason: NonRecoverableReason, message: string) {
    super(message);
    this.name = "NonRecoverableError";
    this.reason = reason;
  }
}

export type NonRecoverableReason =
  | "robots_disallow"
  | "access_blocked" // 401/403, CAPTCHA, or login wall
  | "not_found" // 404/410
  | "unsafe_url" // SSRF guard / non-public target
  | "unsupported_content"
  | "invalid_url";

/** Best-effort classification of an unknown error into retryable or not. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof NonRecoverableError) return false;
  if (error instanceof ProviderNotConfiguredError) return false;
  if (error instanceof RecoverableError) return true;
  // Unknown errors (e.g. undifferentiated network faults) are treated as
  // retryable once or twice; the caller bounds the attempts.
  return true;
}
