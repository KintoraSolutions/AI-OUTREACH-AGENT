import { env } from "@/lib/env";
import { ProviderNotConfiguredError, RecoverableError } from "@/lib/research/errors";
import type { PerformanceProvider, PerformanceResult } from "@/lib/research/types";

/**
 * Null performance provider: reports unconfigured and throws if called, so the
 * UI shows a clear configuration state rather than a fake score (Section 2B).
 */
export class NullPerformanceProvider implements PerformanceProvider {
  readonly name = "none";
  isConfigured(): boolean {
    return false;
  }
  async audit(): Promise<PerformanceResult> {
    throw new ProviderNotConfiguredError("Website performance audit", ["PAGESPEED_API_KEY"]);
  }
}

interface PageSpeedResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number } };
    audits?: Record<string, { numericValue?: number; displayValue?: string }>;
  };
}

/**
 * Google PageSpeed Insights (Lighthouse) performance audit. Compliant API
 * access, one call per audited site (plan.md Section 2A / Section 6 step 5).
 */
export class PageSpeedPerformanceProvider implements PerformanceProvider {
  readonly name = "pagespeed";
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.PAGESPEED_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async audit(url: string): Promise<PerformanceResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("Website performance audit", ["PAGESPEED_API_KEY"]);
    }
    const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("strategy", "MOBILE");
    endpoint.searchParams.set("category", "PERFORMANCE");
    endpoint.searchParams.set("key", this.apiKey!);

    let res: Response;
    try {
      res = await this.fetchImpl(endpoint.toString());
    } catch (e) {
      throw new RecoverableError("Network error calling PageSpeed API.", { cause: e });
    }
    if (res.status === 429 || res.status >= 500) {
      throw new RecoverableError(`PageSpeed API transient error (${res.status}).`);
    }
    if (!res.ok) {
      throw new Error(`PageSpeed API error ${res.status}.`);
    }

    const data = (await res.json()) as PageSpeedResponse;
    const lh = data.lighthouseResult;
    const perfScore = lh?.categories?.performance?.score;
    const lcp = lh?.audits?.["largest-contentful-paint"]?.numericValue;
    const cls = lh?.audits?.["cumulative-layout-shift"]?.numericValue;

    return {
      url,
      performanceScore: typeof perfScore === "number" ? Math.round(perfScore * 100) : null,
      lcpMs: typeof lcp === "number" ? Math.round(lcp) : null,
      cls: typeof cls === "number" ? Number(cls.toFixed(3)) : null,
      mobileFriendly: typeof perfScore === "number" ? perfScore >= 0.5 : null,
    };
  }
}
