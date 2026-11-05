import { describe, expect, it } from "vitest";
import { runCampaignResearch } from "@/lib/research/pipeline";
import { defaultScoringConfig } from "@/lib/scoring/rules";
import { NonRecoverableError, RecoverableError } from "@/lib/research/errors";
import { NullBrowserProvider } from "@/lib/research/providers/browser";
import { NullPerformanceProvider } from "@/lib/research/providers/performance";
import { computeDedupeKey } from "@/lib/leads/dedupe";
import type {
  CampaignCriteria,
  ClinicResearchResult,
  DiscoveredClinic,
  DiscoveryProvider,
  FetchResult,
  JobControl,
  JobPatch,
  LoggedError,
  PerformanceProvider,
  ProviderBundle,
  ResearchRepository,
  WebsiteFetcher,
} from "@/lib/research/types";
import type { ScoreResult } from "@/lib/scoring/types";

const noSleep = async () => {};

const CRITERIA: CampaignCriteria = {
  categories: ["Dental"],
  city: "Toronto",
  region: "Ontario",
  country: "Canada",
  radiusMeters: null,
  minLocations: 1,
  maxLeads: 50,
  requiredKeywords: [],
  excludedKeywords: [],
};

function makeCandidate(name: string, websiteUrl: string | null): DiscoveredClinic {
  return {
    name,
    websiteUrl,
    mainPhone: "+1-416-555-0000",
    address: `1 ${name} Rd, Toronto`,
    category: "Dental",
    locationCount: null,
    externalId: name,
    sourceUrl: `https://provider.example/${encodeURIComponent(name)}`,
    keywordsHaystack: name.toLowerCase(),
  };
}

// --- Fakes -----------------------------------------------------------------

class FakeDiscovery implements DiscoveryProvider {
  readonly name = "fake";
  constructor(private readonly results: DiscoveredClinic[]) {}
  isConfigured() {
    return true;
  }
  async discover(_c: CampaignCriteria, limit: number) {
    return this.results.slice(0, limit);
  }
}

interface FetchPlan {
  html?: string;
  error?: Error;
  failTimes?: number; // throw `error` this many times, then succeed
}

class FakeFetcher implements WebsiteFetcher {
  readonly name = "fake";
  readonly calls: Record<string, number> = {};
  constructor(private readonly plan: Record<string, FetchPlan>) {}
  async fetch(url: string): Promise<FetchResult> {
    const host = new URL(url).hostname.replace(/^www\./, "");
    this.calls[host] = (this.calls[host] ?? 0) + 1;
    const p = this.plan[host];
    if (!p) throw new NonRecoverableError("not_found", `no plan for ${host}`);
    if (p.error) {
      if (!p.failTimes || this.calls[host] <= p.failTimes) throw p.error;
    }
    return { finalUrl: url, status: 200, contentType: "text/html", html: p.html ?? "<html></html>" };
  }
}

interface SavedRecord {
  result: ClinicResearchResult;
  score: ScoreResult;
  sources: { url: string; type: string; collectedAt: Date }[];
  collectedAt: Date;
}

class InMemoryRepo implements ResearchRepository {
  readonly saved: SavedRecord[] = [];
  readonly patches: JobPatch[] = [];
  readonly errors: LoggedError[] = [];
  campaignStatus: string | null = null;
  control: JobControl = { cancelRequested: false, pauseRequested: false };
  private readonly created = new Set<string>();
  onSaved?: (result: ClinicResearchResult, repo: InMemoryRepo) => void;
  beforeSave?: (result: ClinicResearchResult) => void;

  constructor(
    private readonly criteria: CampaignCriteria,
    private readonly existing: Set<string> = new Set(),
  ) {}

  async loadCriteria() {
    return { orgId: "org1", criteria: this.criteria };
  }
  async existingDedupeKeys() {
    return new Set(this.existing);
  }
  async loadScoringConfig() {
    return defaultScoringConfig();
  }
  async readControl() {
    return { ...this.control };
  }
  async updateJob(_jobId: string, patch: JobPatch) {
    this.patches.push(patch);
  }
  async saveClinic(
    _orgId: string,
    _campaignId: string,
    result: ClinicResearchResult,
    score: ScoreResult,
  ) {
    this.beforeSave?.(result);
    if (this.existing.has(result.dedupeKey) || this.created.has(result.dedupeKey)) {
      return "duplicate" as const;
    }
    this.created.add(result.dedupeKey);
    const now = new Date();
    this.saved.push({
      result,
      score,
      sources: result.sources.map((s) => ({ url: s.url, type: s.type, collectedAt: now })),
      collectedAt: now,
    });
    this.onSaved?.(result, this);
    return "created" as const;
  }
  async logError(_jobId: string, error: LoggedError) {
    this.errors.push(error);
  }
  async setCampaignStatus(_campaignId: string, status: string) {
    this.campaignStatus = status;
  }

  get lastStatus() {
    return [...this.patches].reverse().find((p) => p.status)?.status ?? null;
  }
}

function bundle(discovery: DiscoveryProvider, fetcher: WebsiteFetcher, performance?: PerformanceProvider): ProviderBundle {
  return {
    discovery,
    fetcher,
    performance: performance ?? new NullPerformanceProvider(),
    browser: new NullBrowserProvider(),
  };
}

// --- Tests -----------------------------------------------------------------

describe("runCampaignResearch", () => {
  it("stores each clinic with its source URLs and collection timestamps", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const providers = bundle(
      new FakeDiscovery([makeCandidate("Bright Dental", "https://bright.example")]),
      new FakeFetcher({
        "bright.example": {
          html: `<a href="mailto:hi@bright.example">Email</a><a href="/contact">Contact</a>`,
        },
      }),
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.status).toBe("SUCCEEDED");
    expect(repo.saved).toHaveLength(1);
    const rec = repo.saved[0]!;
    const types = rec.sources.map((s) => s.type);
    expect(types).toContain("discovery");
    expect(types).toContain("website");
    expect(rec.sources.every((s) => s.collectedAt instanceof Date)).toBe(true);
    expect(rec.result.publicEmail).toBe("hi@bright.example");
    expect(repo.campaignStatus).toBe("COMPLETED");
  });

  it("computes and stores a transparent score for each researched clinic", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const providers = bundle(
      new FakeDiscovery([makeCandidate("Scored Clinic", "https://scored.example")]),
      new FakeFetcher({
        "scored.example": { html: `<a href="tel:+14165551234">Call</a>` },
      }),
    );

    await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    const rec = repo.saved[0]!;
    expect(rec.score.overallScore).toBeGreaterThanOrEqual(0);
    expect(rec.score.overallScore).toBeLessThanOrEqual(100);
    expect(rec.score.rulesetVersion).toBe("default-v1");
    // Business-fit fires (a target category) and contactability (a phone), so the
    // score is explainable and nonzero.
    expect(rec.score.businessFitScore).toBeGreaterThan(0);
    expect(rec.score.breakdown.categories.BUSINESS_FIT.contributions.length).toBeGreaterThan(0);
  });

  it("prevents duplicates against existing clinics", async () => {
    const existingKey = computeDedupeKey({ name: "Existing", websiteUrl: "https://dup.example" });
    const repo = new InMemoryRepo(CRITERIA, new Set([existingKey]));
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("Existing", "https://dup.example"),
        makeCandidate("New Clinic", "https://new.example"),
      ]),
      new FakeFetcher({ "new.example": { html: "<html></html>" }, "dup.example": { html: "<html></html>" } }),
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(repo.saved.map((r) => r.result.candidate.name)).toEqual(["New Clinic"]);
    expect(summary.duplicates).toBeGreaterThanOrEqual(1);
  });

  it("retries a recoverable website failure, then succeeds", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const fetcher = new FakeFetcher({
      "flaky.example": {
        error: new RecoverableError("temporary network blip"),
        failTimes: 1,
        html: `<a href="mailto:hi@flaky.example">Email</a>`,
      },
    });
    const providers = bundle(
      new FakeDiscovery([makeCandidate("Flaky Clinic", "https://flaky.example")]),
      fetcher,
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(fetcher.calls["flaky.example"]).toBe(2); // failed once, retried, succeeded
    expect(summary.status).toBe("SUCCEEDED");
    expect(repo.saved[0]!.result.publicEmail).toBe("hi@flaky.example");
    expect(repo.saved[0]!.result.softErrors).toHaveLength(0);
  });

  it("saves partial results and continues when one website fails permanently", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const fetcher = new FakeFetcher({
      "ok.example": { html: `<a href="mailto:hi@ok.example">Email</a>` },
      "blocked.example": { error: new NonRecoverableError("robots_disallow", "blocked by robots.txt") },
    });
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("OK Clinic", "https://ok.example"),
        makeCandidate("Blocked Clinic", "https://blocked.example"),
      ]),
      fetcher,
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    // Both clinics are saved (the blocked one from discovery data alone).
    expect(repo.saved).toHaveLength(2);
    const blocked = repo.saved.find((r) => r.result.candidate.name === "Blocked Clinic")!;
    expect(blocked.result.softErrors.some((e) => !e.retryable)).toBe(true);
    expect(blocked.sources.map((s) => s.type)).toContain("discovery");
    expect(blocked.sources.map((s) => s.type)).not.toContain("website");
    expect(fetcher.calls["blocked.example"]).toBe(1); // not retried
    // A soft error was logged; the campaign still completed successfully.
    expect(repo.errors.some((e) => e.scope === "enrich" && !e.retryable)).toBe(true);
    expect(summary.status).toBe("SUCCEEDED");
  });

  it("isolates a hard save failure and reports PARTIAL", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    repo.beforeSave = (result) => {
      if (result.candidate.name === "Boom Clinic") throw new Error("db write failed");
    };
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("Good Clinic", "https://good.example"),
        makeCandidate("Boom Clinic", "https://boom.example"),
      ]),
      new FakeFetcher({
        "good.example": { html: "<html></html>" },
        "boom.example": { html: "<html></html>" },
      }),
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(repo.saved.map((r) => r.result.candidate.name)).toEqual(["Good Clinic"]);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.status).toBe("PARTIAL");
    expect(repo.errors.some((e) => e.scope === "enrich")).toBe(true);
  });

  it("honors cancellation between clinics", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    repo.onSaved = (_r, r) => {
      r.control.cancelRequested = true; // cancel after the first save
    };
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("First", "https://first.example"),
        makeCandidate("Second", "https://second.example"),
      ]),
      new FakeFetcher({
        "first.example": { html: "<html></html>" },
        "second.example": { html: "<html></html>" },
      }),
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(repo.saved).toHaveLength(1);
    expect(summary.status).toBe("CANCELLED");
    expect(repo.campaignStatus).toBe("CANCELLED");
  });

  it("honors pause between clinics", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    repo.onSaved = (_r, r) => {
      r.control.pauseRequested = true;
    };
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("First", "https://first.example"),
        makeCandidate("Second", "https://second.example"),
      ]),
      new FakeFetcher({
        "first.example": { html: "<html></html>" },
        "second.example": { html: "<html></html>" },
      }),
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(repo.saved).toHaveLength(1);
    expect(summary.status).toBe("PAUSED");
    expect(repo.campaignStatus).toBe("PAUSED");
  });

  it("reports a clear failure when discovery is unconfigured (no fake run)", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const { NullDiscoveryProvider } = await import("@/lib/research/providers/discovery");
    const providers = bundle(new NullDiscoveryProvider(), new FakeFetcher({}));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.status).toBe("FAILED");
    expect(repo.saved).toHaveLength(0);
    expect(repo.errors.some((e) => e.scope === "discovery")).toBe(true);
    expect(repo.errors.find((e) => e.scope === "discovery")!.message).toContain("GOOGLE_PLACES_API_KEY");
  });
});

/**
 * Replacement pass.
 *
 * Discovery over-fetches to survive post-filtering, and the surplus beyond
 * maxLeads used to be discarded. A campaign asked for N leads would then finish
 * short whenever a site was unreachable, with no indication that the shortfall
 * was fixable. These lock in that the reserves are used, bounded, and that the
 * pass respects the same pause/cancel contract as the main loop.
 */
describe("runCampaignResearch — replacing failed clinics", () => {
  const SMALL: CampaignCriteria = { ...CRITERIA, maxLeads: 3 };

  const SIX = [
    makeCandidate("Alpha", "https://alpha.example"),
    makeCandidate("Bravo", "https://bravo.example"),
    makeCandidate("Charlie", "https://charlie.example"),
    makeCandidate("Delta", "https://delta.example"),
    makeCandidate("Echo", "https://echo.example"),
    makeCandidate("Foxtrot", "https://foxtrot.example"),
  ];

  const ALL_SITES = Object.fromEntries(
    SIX.map((c) => [new URL(c.websiteUrl!).hostname, { html: "<html></html>" }]),
  );

  /** Make named clinics fail at the point of saving. */
  function failOn(repo: InMemoryRepo, names: string[]) {
    repo.beforeSave = (result) => {
      if (names.includes(result.candidate.name)) throw new Error("save exploded");
    };
  }

  it("pulls a reserve in when a clinic cannot be saved", async () => {
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Bravo"]);
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    // Asked for 3, one failed, one reserve researched to make up for it.
    expect(summary.succeeded).toBe(3);
    expect(summary.failed).toBe(1);
    expect(summary.replaced).toBe(1);
    expect(repo.saved.map((s) => s.result.candidate.name)).toEqual([
      "Alpha",
      "Charlie",
      "Delta",
    ]);
  });

  it("keeps drawing when a replacement itself fails", async () => {
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Bravo", "Delta"]);
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.succeeded).toBe(3);
    expect(summary.replaced).toBe(2);
    expect(repo.saved.map((s) => s.result.candidate.name)).toEqual(["Alpha", "Charlie", "Echo"]);
  });

  it("does not touch the reserves when everything succeeded", async () => {
    const repo = new InMemoryRepo(SMALL);
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.replaced).toBe(0);
    expect(summary.succeeded).toBe(3);
    expect(repo.saved).toHaveLength(3);
  });

  it("stops when the reserve pool runs dry rather than looping", async () => {
    // Four discovered, three wanted: only one reserve exists for two failures.
    const four = SIX.slice(0, 4);
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Alpha", "Bravo"]);
    const providers = bundle(
      new FakeDiscovery(four),
      new FakeFetcher(
        Object.fromEntries(four.map((c) => [new URL(c.websiteUrl!).hostname, { html: "<html>" }])),
      ),
    );

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.replaced).toBe(1);
    expect(summary.succeeded).toBe(2);
    expect(summary.status).toBe("PARTIAL");
  });

  it("never reports progress above 100%", async () => {
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Alpha", "Bravo"]);
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));

    await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    const progresses = repo.patches.map((p) => p.progress).filter((n): n is number => n != null);
    expect(Math.max(...progresses)).toBeLessThanOrEqual(100);
  });

  it("counts replacements in the job total so the denominator stays honest", async () => {
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Bravo"]);
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    // 3 planned + 1 replacement actually researched.
    expect(summary.total).toBe(4);
  });

  it("honours a cancel requested during the replacement pass", async () => {
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Alpha", "Bravo", "Charlie"]);
    // Everything in the first pass fails, then cancel before replacements run.
    repo.onSaved = undefined;
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));
    const originalRead = repo.readControl.bind(repo);
    let reads = 0;
    repo.readControl = async () => {
      reads += 1;
      // Let the three planned clinics through, then cancel.
      return reads > 3 ? { cancelRequested: true, pauseRequested: false } : originalRead();
    };

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.status).toBe("CANCELLED");
    expect(summary.replaced).toBe(0);
  });

  it("mentions the replacements in the finishing message", async () => {
    const repo = new InMemoryRepo(SMALL);
    failOn(repo, ["Bravo"]);
    const providers = bundle(new FakeDiscovery(SIX), new FakeFetcher(ALL_SITES));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { sleep: noSleep });

    expect(summary.message).toMatch(/1 replaced from reserves/);
  });
});
