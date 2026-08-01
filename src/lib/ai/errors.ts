/**
 * Typed AI errors so callers can tell a configuration problem (surface a clear
 * "connect the provider" message) apart from a transient generation failure
 * (retry or show an error state). The app never falls back to fake AI output on
 * either error in production.
 */

/** Thrown when the AI provider has no credentials configured. */
export class AiNotConfiguredError extends Error {
  constructor(message = "The AI provider is not configured. Set ANTHROPIC_API_KEY to enable drafting.") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

/** Thrown when generation failed (network, timeout, invalid structured output). */
export class AiGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AiGenerationError";
  }
}
