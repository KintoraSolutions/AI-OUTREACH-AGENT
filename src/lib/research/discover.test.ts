import { describe, expect, it } from "vitest";
import { runDiscovery } from "@/lib/research/discover";
import { computeDedupeKey } from "@/lib/leads/dedupe";
import type {
  CampaignCriteria,
  DiscoveredClinic,
  DiscoveryProvider,
} from "@/lib/research/types";

function candidate(partial: Partial<DiscoveredClinic> & { name: string }): DiscoveredClinic {
  return {
    name: partial.name,
    websiteUrl: partial.websiteUrl ?? null,
    mainPhone: partial.mainPhone ?? null,
    address: partial.address ?? null,
    category: partial.category ?? "Clinic",
    locationCount: partial.locationCount ?? null,
    externalId: partial.externalId ?? null,
    sourceUrl: partial.sourceUrl ?? "https://provider.example/result",
    keywordsHaystack: partial.keywordsHaystack ?? partial.name.toLowerCase(),
  };
}

class FakeDiscovery implements DiscoveryProvider {
  readonly name = "fake";
  constructor(private readonly results: DiscoveredClinic[]) {}
  isConfigured() {
    return true;
  }
  async discover(_criteria: CampaignCriteria, limit: number) {
    return this.results.slice(0, limit);
  }
}

const baseCriteria: CampaignCriteria = {
  categories: ["Dental"],
  city: "Toronto",
  region: "Ontario",
  country: "Canada",
  radiusMeters: null,
  minLocations: 1,
  maxLeads: 10,
  requiredKeywords: [],
  excludedKeywords: [],
};

describe("runDiscovery", () => {
  it("filters by required and excluded keywords", async () => {
    const provider = new FakeDiscovery([
      candidate({ name: "Bright Dental", keywordsHaystack: "bright dental cosmetic" }),
      candidate({ name: "City Physio", keywordsHaystack: "city physiotherapy" }),
      candidate({ name: "Downtown Dental Hospital", keywordsHaystack: "dental hospital" }),
    ]);
    const outcome = await runDiscovery(
      provider,
      { ...baseCriteria, requiredKeywords: ["dental"], excludedKeywords: ["hospital"] },
      new Set(),
    );
    const names = outcome.candidates.map((c) => c.candidate.name);
    expect(names).toEqual(["Bright Dental"]);
    expect(outcome.filtered).toBe(2);
  });

  it("excludes candidates below the minimum location count when known", async () => {
    const provider = new FakeDiscovery([
      candidate({ name: "Single Site", locationCount: 1 }),
      candidate({ name: "Multi Site", locationCount: 3 }),
      candidate({ name: "Unknown Sites", locationCount: null }),
    ]);
    const outcome = await runDiscovery(provider, { ...baseCriteria, minLocations: 2 }, new Set());
    const names = outcome.candidates.map((c) => c.candidate.name).sort();
    // "Single Site" excluded; "Unknown Sites" kept (not positively too few).
    expect(names).toEqual(["Multi Site", "Unknown Sites"]);
  });

  it("prevents duplicates against existing clinics and within the batch", async () => {
    const existingKey = computeDedupeKey({ name: "Existing", websiteUrl: "https://dup.example" });
    const provider = new FakeDiscovery([
      candidate({ name: "Existing", websiteUrl: "https://dup.example" }),
      candidate({ name: "Fresh A", websiteUrl: "https://fresha.example" }),
      candidate({ name: "Fresh A copy", websiteUrl: "https://fresha.example" }),
    ]);
    const outcome = await runDiscovery(provider, baseCriteria, new Set([existingKey]));
    expect(outcome.candidates.map((c) => c.candidate.name)).toEqual(["Fresh A"]);
    expect(outcome.duplicates).toBe(2);
  });

  it("caps results at maxLeads", async () => {
    const provider = new FakeDiscovery(
      Array.from({ length: 20 }, (_, i) =>
        candidate({ name: `Clinic ${i}`, websiteUrl: `https://c${i}.example` }),
      ),
    );
    const outcome = await runDiscovery(provider, { ...baseCriteria, maxLeads: 5 }, new Set());
    expect(outcome.candidates).toHaveLength(5);
  });
});
