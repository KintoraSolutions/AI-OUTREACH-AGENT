import { env } from "@/lib/env";
import type { BrowserCapabilities, BrowserProvider } from "@/lib/research/types";

/**
 * Headless browser is deferred for the MVP (decision 5). The Null provider
 * reports all capabilities as false, so screenshots, rendered mobile audits,
 * and console-error inspection are marked unavailable in the UI rather than
 * faked. The basic, no-browser website checks still run. A hosted provider
 * (Browserless / Cloudflare Browser Rendering) can be added later behind this
 * same interface without touching the research engine.
 */
export class NullBrowserProvider implements BrowserProvider {
  readonly name = "none";
  isConfigured(): boolean {
    return false;
  }
  capabilities(): BrowserCapabilities {
    return { screenshots: false, renderedAudit: false, consoleErrors: false };
  }
}

/** Selects a browser provider from configuration. Only Null ships in the MVP. */
export function resolveBrowserProvider(): BrowserProvider {
  const provider = env.BROWSER_PROVIDER;
  const configured =
    (provider === "browserless" && !!env.BROWSERLESS_API_KEY) ||
    (provider === "cloudflare" && !!env.CLOUDFLARE_BROWSER_TOKEN);
  // A hosted implementation would be returned here when `configured` is true.
  // Until one is added, we always return the Null provider (no fake data).
  void configured;
  return new NullBrowserProvider();
}
