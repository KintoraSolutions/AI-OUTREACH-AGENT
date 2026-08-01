import { AnthropicAiProvider } from "@/lib/ai/anthropic";
import type { AiProvider } from "@/lib/ai/types";

/**
 * Returns the production AI provider (Anthropic). It is always the REAL provider:
 * there is no fake fallback in this path, so the app never silently produces
 * fabricated AI output. When credentials are missing, the provider reports
 * `isConfigured() === false` and throws `AiNotConfiguredError` if called, which
 * the UI surfaces as a clear "connect the provider" configuration state.
 *
 * Tests inject a deterministic fake provider directly into the drafting engine;
 * that fake never ships through this factory.
 */
let provider: AiProvider | null = null;

export function getAiProvider(): AiProvider {
  return (provider ??= new AnthropicAiProvider());
}

/** Lightweight description for the UI (provider id, model, configured state). */
export function describeAiProvider(): { name: string; model: string; configured: boolean } {
  const p = getAiProvider();
  return { name: p.name, model: p.model, configured: p.isConfigured() };
}
