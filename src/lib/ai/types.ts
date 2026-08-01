/**
 * AiProvider contract (plan.md Section 7). A provider turns a prompt plus a JSON
 * schema into a validated, structured object. The interface is intentionally
 * small and provider-agnostic so Anthropic can be swapped for another model or a
 * deterministic fake (tests only) without touching the drafting engine.
 *
 * Responsibilities of an implementation:
 *  - structured output (the model must return an object matching `schema`);
 *  - retry handling (transient network/5xx/429 errors);
 *  - timeout handling;
 *  - clear configuration errors (`AiNotConfiguredError` when no credentials);
 *  - never returning fabricated output when unconfigured.
 */

export interface AiStructuredRequest<T> {
  /** System prompt (role, rules, guardrails). */
  system: string;
  /** The user turn: the evidence and task. */
  prompt: string;
  /** Name of the structured-output tool the model must call. */
  toolName: string;
  /** Human description of the tool, shown to the model. */
  toolDescription: string;
  /** JSON Schema for the tool input (the structured output shape). */
  schema: Record<string, unknown>;
  /**
   * Validates + narrows the model's raw structured output. Should throw if the
   * output does not match the expected shape (the provider wraps that as an
   * AiGenerationError after exhausting retries).
   */
  parse: (raw: unknown) => T;
  /** Output token budget (defaults applied by the provider). */
  maxTokens?: number;
}

export interface AiProvider {
  /** Stable provider id, e.g. "anthropic". */
  readonly name: string;
  /** Resolved model id (configurable, never a hardcoded-unchangeable value). */
  readonly model: string;
  /** True when credentials are present. */
  isConfigured(): boolean;
  /**
   * Generate a single structured object. Throws `AiNotConfiguredError` when
   * unconfigured and `AiGenerationError` when generation ultimately fails.
   */
  generateStructured<T>(request: AiStructuredRequest<T>): Promise<T>;
}
