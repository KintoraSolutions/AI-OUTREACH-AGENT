import { DomainRateLimiter } from "@/lib/research/rate-limit";
import type { ProviderBundle } from "@/lib/research/types";
import {
  GooglePlacesDiscoveryProvider,
  NullDiscoveryProvider,
} from "@/lib/research/providers/discovery";
import { HttpWebsiteFetcher } from "@/lib/research/providers/fetcher";
import {
  NullPerformanceProvider,
  PageSpeedPerformanceProvider,
} from "@/lib/research/providers/performance";
import { resolveBrowserProvider } from "@/lib/research/providers/browser";

/**
 * Resolves the production provider bundle from the environment. A capability is
 * "real" only when its credentials are present; otherwise a Null provider is
 * used so the app reports the feature as unavailable instead of faking results
 * (plan.md Section 2B, decision 6). The website fetcher needs no credentials, so
 * it is always the real, compliance-first implementation.
 */
export function getProviderBundle(): ProviderBundle {
  const discovery = new GooglePlacesDiscoveryProvider();
  const performance = new PageSpeedPerformanceProvider();
  // Share one rate limiter across the run so per-domain pacing is global.
  const fetcher = new HttpWebsiteFetcher({ rateLimiter: new DomainRateLimiter() });

  return {
    discovery: discovery.isConfigured() ? discovery : new NullDiscoveryProvider(),
    performance: performance.isConfigured() ? performance : new NullPerformanceProvider(),
    fetcher,
    browser: resolveBrowserProvider(),
  };
}

export {
  GooglePlacesDiscoveryProvider,
  NullDiscoveryProvider,
} from "@/lib/research/providers/discovery";
export { HttpWebsiteFetcher } from "@/lib/research/providers/fetcher";
export {
  PageSpeedPerformanceProvider,
  NullPerformanceProvider,
} from "@/lib/research/providers/performance";
export {
  NullBrowserProvider,
  resolveBrowserProvider,
} from "@/lib/research/providers/browser";
