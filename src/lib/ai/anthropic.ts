import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import { AiGenerationError, AiNotConfiguredError } from "@/lib/ai/errors";
import type { AiProvider, AiStructuredRequest } from "@/lib/ai/types";

/**
 * Anthropic implementation of `AiProvider` (plan.md Section 7, decision 2).
 *
 * Structured output is enforced with forced tool use: the model is required to
 * call a single tool whose `input_schema` is the desired shape, so the response
 * is always a JSON object we validate with the caller's `parse` (Zod). This is
 * the most broadly-supported structured-output mechanism and keeps the provider
 * independent of any one SDK's newest output-format API.
 *
 * The model id is configurable via `AI_MODEL` (default `claude-opus-5`); it is
 * never a hardcoded value that cannot be replaced. Retries (transient
 * network/5xx/429) and a per-request timeout are handled here; a missing API key
 * raises `AiNotConfiguredError` rather than silently producing fake output.
 */

export const DEFAULT_AI_MODEL = "claude-opus-5";

function num(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export class AnthropicAiProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly maxTokens: number;
  private client: Anthropic | null = null;

  constructor() {
    this.model = env.AI_MODEL?.trim() || DEFAULT_AI_MODEL;
    this.timeoutMs = num(env.AI_TIMEOUT_MS, 60_000);
    this.maxRetries = num(env.AI_MAX_RETRIES, 2);
    this.maxTokens = num(env.AI_MAX_OUTPUT_TOKENS, 1024);
  }

  isConfigured(): boolean {
    return typeof env.ANTHROPIC_API_KEY === "string" && env.ANTHROPIC_API_KEY.trim().length > 0;
  }

  private getClient(): Anthropic {
    if (!this.isConfigured()) throw new AiNotConfiguredError();
    // We do our own retry loop, so disable the SDK's internal retries.
    this.client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
    return this.client;
  }

  async generateStructured<T>(request: AiStructuredRequest<T>): Promise<T> {
    const client = this.getClient();
    const tool: Anthropic.Tool = {
      name: request.toolName,
      description: request.toolDescription,
      input_schema: request.schema as Anthropic.Tool.InputSchema,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const message = await client.messages.create(
          {
            model: this.model,
            max_tokens: request.maxTokens ?? this.maxTokens,
            system: request.system,
            messages: [{ role: "user", content: request.prompt }],
            tools: [tool],
            // Force the model to return the structured tool input.
            tool_choice: { type: "tool", name: request.toolName },
          },
          { timeout: this.timeoutMs },
        );

        const block = message.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === request.toolName,
        );
        if (!block) {
          throw new AiGenerationError("The model did not return the expected structured output.");
        }
        // `parse` throws on shape mismatch; that is not retryable, so rethrow.
        return request.parse(block.input);
      } catch (error) {
        lastError = error;
        if (!isRetryable(error) || attempt === this.maxRetries) break;
        await sleep(backoffMs(attempt));
      }
    }

    if (lastError instanceof AiGenerationError) throw lastError;
    const detail = lastError instanceof Error ? lastError.message : String(lastError);
    throw new AiGenerationError(`AI generation failed: ${detail}`, lastError);
  }
}

/** Retry transient failures only: connection errors and 408/409/429/5xx. */
function isRetryable(error: unknown): boolean {
  // A shape-validation failure from `parse` is deterministic, never retry it.
  if (error instanceof AiGenerationError) return false;
  if (error instanceof Anthropic.APIConnectionError) return true;
  const status = (error as { status?: number })?.status;
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return false;
}

function backoffMs(attempt: number): number {
  return Math.min(2000, 250 * 2 ** attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
