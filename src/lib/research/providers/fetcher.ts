import { NonRecoverableError, RecoverableError } from "@/lib/research/errors";
import { DomainRateLimiter } from "@/lib/research/rate-limit";
import {
  crawlDelaySeconds,
  isPathAllowed,
  parseRobots,
  RESEARCH_USER_AGENT,
} from "@/lib/research/robots";
import { assertSafeUrl, assertSafeUrlResolved } from "@/lib/research/url-guard";
import type { FetchResult, WebsiteFetcher } from "@/lib/research/types";

// Redirects are followed manually so each hop can be re-validated against the
// SSRF guard before a request is issued. A public site therefore cannot bounce
// the crawler to an internal target, and the chain is bounded.
const MAX_REDIRECTS = 5;

/**
 * Real website fetcher built on the platform `fetch`. It is free (no external
 * provider) and always available, but it is strictly compliant:
 *
 *  - checks robots.txt first and obeys Disallow + Crawl-delay (never bypassed),
 *  - refuses non-public / internal targets (SSRF guard),
 *  - rate-limits per domain,
 *  - identifies itself with an honest User-Agent,
 *  - stops (non-retryable) on 401/403/429/CAPTCHA/login walls instead of
 *    attempting to defeat them,
 *  - caps body size and applies a timeout.
 *
 * Access-control-related failures throw NonRecoverableError; transient network
 * or 5xx failures throw RecoverableError so the pipeline can retry.
 */

export interface HttpFetcherOptions {
  timeoutMs?: number;
  maxBytes?: number;
  rateLimiter?: DomainRateLimiter;
  /** Injectable fetch for testing. */
  fetchImpl?: typeof fetch;
}

const CAPTCHA_MARKERS = [
  "captcha",
  "g-recaptcha",
  "hcaptcha",
  "cf-challenge",
  "please enable javascript and cookies",
  "attention required! | cloudflare",
];

export class HttpWebsiteFetcher implements WebsiteFetcher {
  readonly name = "fetch+robots";
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly limiter: DomainRateLimiter;
  private readonly fetchImpl: typeof fetch;
  private readonly robotsCache = new Map<string, { allowed: (path: string) => boolean }>();

  constructor(options: HttpFetcherOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 12000;
    this.maxBytes = options.maxBytes ?? 2_000_000;
    this.limiter = options.rateLimiter ?? new DomainRateLimiter();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async loadRobots(origin: string, host: string): Promise<(path: string) => boolean> {
    const cached = this.robotsCache.get(origin);
    if (cached) return cached.allowed;

    let allowed: (path: string) => boolean = () => true;
    try {
      await this.limiter.wait(host);
      const res = await this.fetchSafe(`${origin}/robots.txt`);
      if (res.ok) {
        const text = (await res.text()).slice(0, 500_000);
        const rules = parseRobots(text);
        const delay = crawlDelaySeconds(rules);
        if (delay && delay > 0) this.limiter.setInterval(host, delay * 1000);
        allowed = (path: string) => isPathAllowed(rules, path);
      }
      // A missing/failed robots.txt (404/5xx) is treated as "allowed", per the
      // exclusion standard.
    } catch {
      // Network issue fetching robots -> default allow but keep polite pacing.
    }
    this.robotsCache.set(origin, { allowed });
    return allowed;
  }

  /**
   * Fetch `rawUrl`, following redirects MANUALLY so every hop (including the
   * initial URL) is DNS-resolved and re-validated by the SSRF guard before a
   * request is issued. Caps the redirect chain and shares one timeout across it.
   */
  private async fetchSafe(rawUrl: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let current = (await assertSafeUrlResolved(rawUrl)).toString();
      for (let hop = 0; ; hop++) {
        const res = await this.fetchImpl(current, {
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "User-Agent": RESEARCH_USER_AGENT,
            Accept: "text/html,application/xhtml+xml",
          },
        });

        const location = res.headers.get("location");
        const isRedirect = res.status >= 300 && res.status < 400 && !!location;
        if (!isRedirect) return res;

        if (hop >= MAX_REDIRECTS) {
          throw new NonRecoverableError("unsafe_url", `Too many redirects from ${rawUrl}.`);
        }
        // Resolve the target relative to the current URL and re-validate it
        // (DNS-aware) BEFORE following, so a redirect cannot reach internal space.
        const next = new URL(location!, current).toString();
        await assertSafeUrlResolved(next);
        await res.body?.cancel().catch(() => {});
        current = next;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async fetch(rawUrl: string): Promise<FetchResult> {
    const url = assertSafeUrl(rawUrl);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const origin = `${url.protocol}//${url.host}`;

    const allowed = await this.loadRobots(origin, host);
    if (!allowed(url.pathname)) {
      throw new NonRecoverableError(
        "robots_disallow",
        `robots.txt disallows crawling ${url.pathname} on ${host}.`,
      );
    }

    await this.limiter.wait(host);

    let res: Response;
    try {
      res = await this.fetchSafe(url.toString());
    } catch (e) {
      // An SSRF/target-safety block must not be retried or masked as a transient
      // network error; re-throw it as-is. Everything else is a transient failure.
      if (e instanceof NonRecoverableError) throw e;
      throw new RecoverableError(`Network error fetching ${rawUrl}`, { cause: e });
    }

    if (res.status === 401 || res.status === 403) {
      throw new NonRecoverableError("access_blocked", `Access blocked (${res.status}) at ${host}.`);
    }
    if (res.status === 404 || res.status === 410) {
      throw new NonRecoverableError("not_found", `Page not found (${res.status}) at ${rawUrl}.`);
    }
    if (res.status === 429) {
      throw new NonRecoverableError(
        "access_blocked",
        `Rate limited (429) by ${host}; backing off and not retrying this run.`,
      );
    }
    if (res.status >= 500) {
      throw new RecoverableError(`Server error (${res.status}) at ${host}.`);
    }

    const contentType = res.headers.get("content-type");
    if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
      throw new NonRecoverableError(
        "unsupported_content",
        `Unsupported content type (${contentType}) at ${rawUrl}.`,
      );
    }

    const html = await this.readCapped(res);
    const lower = html.slice(0, 4000).toLowerCase();
    if (CAPTCHA_MARKERS.some((m) => lower.includes(m))) {
      throw new NonRecoverableError(
        "access_blocked",
        `A CAPTCHA or bot wall was detected at ${host}; not bypassing.`,
      );
    }

    return {
      finalUrl: res.url || url.toString(),
      status: res.status,
      contentType,
      html,
    };
  }

  private async readCapped(res: Response): Promise<string> {
    if (!res.body) return await res.text();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let out = "";
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (received >= this.maxBytes) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
    return out;
  }
}
