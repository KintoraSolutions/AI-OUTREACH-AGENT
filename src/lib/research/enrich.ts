import { buildAuditFindings } from "@/lib/scoring/audit";
import { extractSiteInfo } from "@/lib/research/extract";
import { NonRecoverableError } from "@/lib/research/errors";
import { withRetry } from "@/lib/research/retry";
import { toAbsoluteUrl } from "@/lib/research/url-guard";
import type {
  ClinicResearchResult,
  CollectedSource,
  DiscoveredClinic,
  ExtractedLocation,
  PerformanceResult,
  ProviderBundle,
} from "@/lib/research/types";

export interface EnrichOptions {
  /** Retry attempts for transient (recoverable) fetch/audit failures. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Enrich one discovered clinic: visit its official website (compliantly),
 * extract public business contact info + service/booking/location signals,
 * run an optional performance audit, and record every source URL with its
 * collection time.
 *
 * Resilience (plan.md Section 5/6): each sub-step is guarded independently so a
 * late failure still returns the data gathered earlier. The discovery data
 * alone is always enough to persist a record, so one failing website never
 * loses the lead or stops the campaign. Only the discovery `candidate`,
 * `dedupeKey`, and injected providers are required — no DB, no job runner —
 * which keeps this unit-testable with fakes.
 */
export async function enrichClinic(
  candidate: DiscoveredClinic,
  dedupeKey: string,
  providers: Pick<ProviderBundle, "fetcher" | "performance" | "browser">,
  options: EnrichOptions = {},
): Promise<ClinicResearchResult> {
  const retry = { retries: options.retries ?? 1, sleep: options.sleep };
  const sources: CollectedSource[] = [
    { url: candidate.sourceUrl, type: "discovery", notes: "Discovery provider result" },
  ];
  const softErrors: ClinicResearchResult["softErrors"] = [];

  const websiteUrl = toAbsoluteUrl(candidate.websiteUrl);
  let siteInfo: ReturnType<typeof extractSiteInfo> | null = null;
  let siteReachable = false;
  let finalWebsiteUrl = websiteUrl;

  if (websiteUrl) {
    try {
      // Retry transient failures (network, 5xx); NonRecoverableError (robots
      // disallow, access wall, 404) is rethrown immediately and never retried.
      const res = await withRetry(() => providers.fetcher.fetch(websiteUrl), retry);
      siteReachable = true;
      finalWebsiteUrl = res.finalUrl;
      siteInfo = extractSiteInfo(res.html, res.finalUrl);
      sources.push({ url: res.finalUrl, type: "website", notes: "Clinic website" });
      if (siteInfo.contactPageUrl && siteInfo.contactPageUrl !== res.finalUrl) {
        sources.push({ url: siteInfo.contactPageUrl, type: "contact_page" });
      }
    } catch (e) {
      softErrors.push({
        targetUrl: websiteUrl,
        message: e instanceof Error ? e.message : String(e),
        retryable: !(e instanceof NonRecoverableError),
      });
    }
  } else {
    softErrors.push({
      targetUrl: null,
      message: "No website URL was available for this clinic.",
      retryable: false,
    });
  }

  // Performance audit (best-effort; only if provider is configured + site known).
  let audit: PerformanceResult | null = null;
  if (finalWebsiteUrl && providers.performance.isConfigured()) {
    try {
      const target = finalWebsiteUrl;
      audit = await withRetry(() => providers.performance.audit(target), retry);
      sources.push({ url: finalWebsiteUrl, type: "performance", notes: "PageSpeed Insights" });
    } catch (e) {
      softErrors.push({
        targetUrl: finalWebsiteUrl,
        message: e instanceof Error ? e.message : String(e),
        retryable: true,
      });
    }
  }

  // Merge contact info: prefer website-extracted, fall back to discovery data.
  const publicEmail = siteInfo?.publicEmails[0] ?? null;
  const mainPhone = candidate.mainPhone ?? siteInfo?.phones[0] ?? null;
  const locations = mergeLocations(candidate, siteInfo?.locations ?? []);
  const locationCount = Math.max(candidate.locationCount ?? 1, locations.length || 1);
  const phones = Array.from(
    new Set([...(candidate.mainPhone ? [candidate.mainPhone] : []), ...(siteInfo?.phones ?? [])]),
  );

  // Deterministic audit across all five opportunity areas (evidence only; the
  // scoring engine assigns points). Discovery-derived signals (category,
  // geography, locations) are evaluated even when the website is unreachable.
  const findings = buildAuditFindings({
    discoverySourceUrl: candidate.sourceUrl,
    websiteUrl: finalWebsiteUrl,
    siteReachable,
    site: siteInfo,
    performance: audit,
    category: candidate.category,
    locationCount,
    phones,
    mainPhone,
    publicEmail,
    hasDecisionMakerEmail: false,
    bookingMethod: siteInfo?.bookingMethod ?? null,
    withinGeography: true,
  });

  return {
    candidate,
    dedupeKey,
    websiteUrl: finalWebsiteUrl,
    mainPhone,
    publicEmail,
    contactPageUrl: siteInfo?.contactPageUrl ?? null,
    bookingMethod: siteInfo?.bookingMethod ?? null,
    onlineBookingUrl: siteInfo?.onlineBookingUrl ?? null,
    socialLinks: siteInfo?.socialLinks ?? {},
    websiteTech: siteInfo?.bookingPlatform ? [siteInfo.bookingPlatform] : [],
    locationCount,
    locations,
    audit,
    findings,
    sources,
    softErrors,
  };
}

function mergeLocations(
  candidate: DiscoveredClinic,
  extracted: ExtractedLocation[],
): ExtractedLocation[] {
  const out: ExtractedLocation[] = [];
  const seen = new Set<string>();
  if (candidate.address) {
    out.push({ label: "Primary", address: candidate.address, phone: candidate.mainPhone });
    seen.add(candidate.address.toLowerCase());
  }
  for (const loc of extracted) {
    const key = (loc.address ?? loc.label ?? "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
    if (out.length >= 10) break;
  }
  return out;
}
