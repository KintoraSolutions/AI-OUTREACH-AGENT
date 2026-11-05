import { buildAuditFindings } from "@/lib/scoring/audit";
import { extractSiteInfo } from "@/lib/research/extract";
import { NonRecoverableError } from "@/lib/research/errors";
import { withRetry } from "@/lib/research/retry";
import { toAbsoluteUrl } from "@/lib/research/url-guard";
import { Confidence } from "@prisma/client";
import {
  extractTeam,
  findTeamPageUrls,
  type ExtractedPerson,
} from "@/lib/people/extract-team";
import { isDecisionMakerRole } from "@/lib/people/roles";
import type {
  ClinicResearchResult,
  CollectedSource,
  DiscoveredClinic,
  ExtractedLocation,
  PerformanceResult,
  ProviderBundle,
} from "@/lib/research/types";

/** A clinic listing more than two team pages is listing categories, not people. */
const MAX_TEAM_PAGES = 2;

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
 * Resilience (docs/planning/build-plan.md Section 5/6): each sub-step is guarded independently so a
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

  // Deduped by name across the homepage and every team page, first win.
  const peopleByName = new Map<string, ExtractedPerson>();
  const collectPeople = (found: ExtractedPerson[]) => {
    for (const person of found) {
      const key = person.fullName.toLowerCase();
      const existing = peopleByName.get(key);
      // Prefer the record that actually carries a published address.
      if (!existing || (!existing.email && person.email)) peopleByName.set(key, person);
    }
  };
  let teamPageUrls: string[] = [];

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

      // People the clinic publishes about itself. The homepage sometimes
      // carries the team; more often it links to a dedicated page.
      collectPeople(extractTeam(res.html, res.finalUrl));
      teamPageUrls = findTeamPageUrls(res.html, res.finalUrl).slice(0, MAX_TEAM_PAGES);
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

  // Team pages, fetched through the same robots-respecting fetcher. Each is
  // best-effort: a team page that 404s or is disallowed costs us the people on
  // it, never the lead.
  for (const teamUrl of teamPageUrls) {
    try {
      const res = await withRetry(() => providers.fetcher.fetch(teamUrl), retry);
      collectPeople(extractTeam(res.html, res.finalUrl));
      sources.push({ url: res.finalUrl, type: "website", notes: "Team page" });
    } catch (e) {
      softErrors.push({
        targetUrl: teamUrl,
        message: e instanceof Error ? e.message : String(e),
        retryable: !(e instanceof NonRecoverableError),
      });
    }
  }

  const people = [...peopleByName.values()];

  /**
   * Only an explicitly stated ownership or directorship role counts, and only
   * when the clinic also published that person's address. The scoring rule
   * `contact_decision_maker_email` requires VERIFIED, so a "lead physician"
   * inference deliberately does not qualify.
   *
   * Until this line existed the flag was hardcoded `false`, which is why that
   * rule had never once fired.
   */
  const hasDecisionMakerEmail = people.some(
    (person) =>
      person.email !== null &&
      person.classification !== null &&
      person.classification.confidence === Confidence.VERIFIED &&
      isDecisionMakerRole(person.classification.role),
  );

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
    hasDecisionMakerEmail,
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
    people,
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
