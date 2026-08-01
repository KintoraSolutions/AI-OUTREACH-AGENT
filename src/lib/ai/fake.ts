import { AiNotConfiguredError } from "@/lib/ai/errors";
import type { AiProvider, AiStructuredRequest } from "@/lib/ai/types";

/**
 * Deterministic in-memory AiProvider for TESTS and the DB verification script
 * ONLY. It is never imported by application code and never returned from
 * `getAiProvider()`, so no fake AI output can reach production (decision 6).
 *
 * The `respond` callback returns the raw object the model "would" produce; it is
 * still run through the caller's `parse`, so a fake can also be used to exercise
 * structured-output validation failures.
 */
export interface FakeAiOptions {
  model?: string;
  configured?: boolean;
  respond?: (request: AiStructuredRequest<unknown>) => unknown;
}

export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  readonly model: string;
  readonly calls: AiStructuredRequest<unknown>[] = [];
  private readonly configured: boolean;
  private readonly responder: (request: AiStructuredRequest<unknown>) => unknown;

  constructor(opts: FakeAiOptions = {}) {
    this.model = opts.model ?? "fake-model-v1";
    this.configured = opts.configured ?? true;
    this.responder = opts.respond ?? (() => ({}));
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    this.calls.push(request as AiStructuredRequest<unknown>);
    if (!this.configured) throw new AiNotConfiguredError();
    return request.parse(this.responder(request as AiStructuredRequest<unknown>));
  }
}
