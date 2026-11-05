import { computeDedupeKey } from "@/lib/leads/dedupe";
import type {
  CampaignCriteria,
  DiscoveredClinic,
  DiscoveryProvider,
} from "@/lib/research/types";

/**
 * Discovery step: fetch candidates from the provider, then apply the campaign's
 * required/excluded keyword filters, minimum-location filter, and in-batch +
 * against-existing duplicate prevention (docs/planning/build-plan.md Section 6 step 1 and 7).
 *
 * Pure and provider-injected: the DiscoveryProvider is passed in, so this is
 * exercised in tests with a fake provider and no network.
 */

export type DiscoveredCandidate = { candidate: DiscoveredClinic; dedupeKey: string };

export interface DiscoverOutcome {
  candidates: DiscoveredCandidate[];
  /**
   * Qualified candidates beyond `maxLeads`, kept rather than discarded.
   *
   * Discovery already over-fetches to survive post-filtering, and the surplus
   * used to be thrown away at the `maxLeads` cut-off. The pipeline now draws on
   * it to replace clinics that fail research, so a campaign asked for 40 leads
   * does not quietly finish with 36 because four sites were unreachable.
   */
  reserves: DiscoveredCandidate[];
  filtered: number; // excluded by keyword/min-location rules
  duplicates: number; // dropped as duplicates (existing or in-batch)
}

function matchesKeywords(candidate: DiscoveredClinic, criteria: CampaignCriteria): boolean {
  const haystack = `${candidate.keywordsHaystack} ${candidate.name}`.toLowerCase();
  const required = criteria.requiredKeywords.map((k) => k.toLowerCase()).filter(Boolean);
  const excluded = criteria.excludedKeywords.map((k) => k.toLowerCase()).filter(Boolean);

  if (required.length > 0 && !required.every((k) => haystack.includes(k))) return false;
  if (excluded.some((k) => haystack.includes(k))) return false;
  return true;
}

export async function runDiscovery(
  provider: DiscoveryProvider,
  criteria: CampaignCriteria,
  existingKeys: Set<string>,
): Promise<DiscoverOutcome> {
  // Over-fetch a little so post-filtering still yields up to maxLeads results.
  const fetchLimit = Math.min(Math.max(criteria.maxLeads * 3, criteria.maxLeads), 200);
  const raw = await provider.discover(criteria, fetchLimit);

  const seen = new Set(existingKeys);
  const candidates: DiscoveredCandidate[] = [];
  const reserves: DiscoveredCandidate[] = [];
  let filtered = 0;
  let duplicates = 0;

  for (const candidate of raw) {
    if (!matchesKeywords(candidate, criteria)) {
      filtered++;
      continue;
    }
    if ((candidate.locationCount ?? 1) < criteria.minLocations) {
      // Only exclude when the provider positively reports too few locations.
      if (candidate.locationCount !== null) {
        filtered++;
        continue;
      }
    }
    const dedupeKey = computeDedupeKey({
      name: candidate.name,
      websiteUrl: candidate.websiteUrl,
      primaryAddress: candidate.address,
    });
    if (seen.has(dedupeKey)) {
      duplicates++;
      continue;
    }
    seen.add(dedupeKey);
    if (candidates.length < criteria.maxLeads) {
      candidates.push({ candidate, dedupeKey });
    } else {
      // Past the cut-off: hold the rest back as replacements. Bounded by the
      // provider's own fetch limit, so this cannot grow without limit.
      reserves.push({ candidate, dedupeKey });
    }
  }

  return { candidates, reserves, filtered, duplicates };
}
