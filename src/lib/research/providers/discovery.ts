import { env } from "@/lib/env";
import { ProviderNotConfiguredError, RecoverableError } from "@/lib/research/errors";
import { toAbsoluteUrl } from "@/lib/research/url-guard";
import type {
  CampaignCriteria,
  DiscoveredClinic,
  DiscoveryProvider,
} from "@/lib/research/types";

/**
 * Null discovery provider. Used when GOOGLE_PLACES_API_KEY is absent: it reports
 * itself unconfigured and throws if called, so the app shows a clear
 * configuration state instead of fabricating clinics (docs/planning/build-plan.md Section 2B).
 */
export class NullDiscoveryProvider implements DiscoveryProvider {
  readonly name = "none";
  isConfigured(): boolean {
    return false;
  }
  async discover(): Promise<DiscoveredClinic[]> {
    throw new ProviderNotConfiguredError("Clinic discovery", ["GOOGLE_PLACES_API_KEY"]);
  }
}

interface PlacesResponse {
  places?: PlacePayload[];
  nextPageToken?: string;
}

interface PlacePayload {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  editorialSummary?: { text?: string };
  businessStatus?: string;
}

/**
 * Google Places API (New) discovery via the Text Search endpoint. This is
 * compliant API access — not scraping Google Maps — per docs/planning/build-plan.md Section 6. The
 * key is restricted and never sent to the client.
 */
export class GooglePlacesDiscoveryProvider implements DiscoveryProvider {
  readonly name = "google-places";
  private readonly apiKey: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? env.GOOGLE_PLACES_API_KEY;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  isConfigured(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.trim().length > 0;
  }

  async discover(criteria: CampaignCriteria, limit: number): Promise<DiscoveredClinic[]> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("Clinic discovery", ["GOOGLE_PLACES_API_KEY"]);
    }
    const results: DiscoveredClinic[] = [];
    const seen = new Set<string>();
    // One text query per category keeps each search specific and bounded.
    const categories = criteria.categories.length > 0 ? criteria.categories : ["clinic"];

    for (const category of categories) {
      if (results.length >= limit) break;
      const textQuery = [category, criteria.city, criteria.region, criteria.country]
        .filter(Boolean)
        .join(", ");
      let pageToken: string | undefined;
      for (let page = 0; page < 3 && results.length < limit; page++) {
        const payload = await this.searchText(textQuery, criteria, pageToken);
        for (const place of payload.places ?? []) {
          const candidate = this.toCandidate(place, category);
          if (!candidate) continue;
          const key = candidate.externalId ?? `${candidate.name}|${candidate.address}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push(candidate);
          if (results.length >= limit) break;
        }
        if (!payload.nextPageToken) break;
        pageToken = payload.nextPageToken;
      }
    }
    return results;
  }

  private async searchText(
    textQuery: string,
    criteria: CampaignCriteria,
    pageToken: string | undefined,
  ): Promise<PlacesResponse> {
    const body: Record<string, unknown> = { textQuery, pageSize: 20 };
    if (pageToken) body.pageToken = pageToken;

    let res: Response;
    try {
      res = await this.fetchImpl("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey!,
          "X-Goog-FieldMask": [
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.internationalPhoneNumber",
            "places.nationalPhoneNumber",
            "places.websiteUri",
            "places.primaryTypeDisplayName",
            "places.types",
            "places.editorialSummary",
            "places.businessStatus",
            "nextPageToken",
          ].join(","),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new RecoverableError("Network error calling Google Places API.", { cause: e });
    }

    if (res.status === 429 || res.status >= 500) {
      throw new RecoverableError(`Google Places API transient error (${res.status}).`);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Google Places API error ${res.status}: ${detail.slice(0, 300)}`);
    }
    return (await res.json()) as PlacesResponse;
  }

  private toCandidate(place: PlacePayload, category: string): DiscoveredClinic | null {
    const name = place.displayName?.text?.trim();
    if (!name) return null;
    if (place.businessStatus && place.businessStatus !== "OPERATIONAL") return null;

    const haystack = [
      name,
      place.formattedAddress,
      place.primaryTypeDisplayName?.text,
      place.editorialSummary?.text,
      ...(place.types ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      name,
      websiteUrl: toAbsoluteUrl(place.websiteUri) ?? null,
      mainPhone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? null,
      address: place.formattedAddress ?? null,
      category: place.primaryTypeDisplayName?.text ?? category,
      locationCount: null,
      externalId: place.id ?? null,
      sourceUrl: place.id
        ? `https://www.google.com/maps/place/?q=place_id:${place.id}`
        : "https://places.googleapis.com/v1/places:searchText",
      keywordsHaystack: haystack,
    };
  }
}
