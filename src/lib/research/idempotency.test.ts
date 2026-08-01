import { describe, expect, it } from "vitest";
import { runCampaignResearch } from "@/lib/research/pipeline";
import { defaultScoringConfig } from "@/lib/scoring/rules";
import { NullBrowserProvider } from "@/lib/research/providers/browser";
import { NullPerformanceProvider } from "@/lib/research/providers/performance";
import type {
  CampaignCriteria,
  ClinicResearchResult,
  DiscoveredClinic,
  DiscoveryProvider,
  FetchResult,
  JobControl,
  JobStepRunner,
  LoggedError,
  ProviderBundle,
  ResearchRepository,
  WebsiteFetcher,
} from "@/lib/research/types";

/**
 * Durability tests (Prompt-3 infra, item 12). These simulate the conditions the
 * Inngest runner must survive — duplicate event delivery / replay, at-least-once
 * step execution, and mid-run worker interruption — using the runner-agnostic
 * `JobStepRunner` seam and the DB-contract behaviors (unique dedupe key,
 * skip-existing at discovery). They assert the guarantee that matters: a clinic,
 * its sources, and its findings are never duplicated, and an interrupted job can
 * resume to completion.
 *
 * The event- and function-level dedup (stable event id + `idempotency` key) are
 * Inngest platform guarantees configured in `src/inngest/`; what these tests own
 * is the layer that makes re-execution SAFE regardless of how many times the
 * platform delivers or replays.
 */

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

function makeCandidate(name: string, websiteUrl: string): DiscoveredClinic {
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

class FakeFetcher implements WebsiteFetcher {
  readonly name = "fake";
  async fetch(url: string): Promise<FetchResult> {
    return { finalUrl: url, status: 200, contentType: "text/html", html: "<html></html>" };
  }
}

/**
 * In-memory repository that mirrors the real Prisma behaviors the durability
 * story depends on: a unique dedupe key (a second save of the same clinic is a
 * no-op "duplicate"), and `existingDedupeKeys` reflecting ALL persisted clinics
 * (so a resumed run skips what a prior run already saved). Sources and findings
 * are stored per clinic so we can assert they are not duplicated either.
 */
class InMemoryRepo implements ResearchRepository {
  readonly saved = new Map<string, { result: ClinicResearchResult; sourceCount: number; findingCount: number }>();
  readonly errors: LoggedError[] = [];
  campaignStatus: string | null = null;
  control: JobControl = { cancelRequested: false, pauseRequested: false };
  saveAttempts = 0;

  constructor(private readonly criteria: CampaignCriteria) {}

  async loadCriteria() {
    return { orgId: "org1", criteria: this.criteria };
  }
  async existingDedupeKeys() {
    return new Set(this.saved.keys());
  }
  async loadScoringConfig() {
    return defaultScoringConfig();
  }
  async readControl() {
    return { ...this.control };
  }
  async updateJob() {}
  async saveClinic(_orgId: string, _campaignId: string, result: ClinicResearchResult) {
    this.saveAttempts++;
    if (this.saved.has(result.dedupeKey)) return "duplicate" as const;
    this.saved.set(result.dedupeKey, {
      result,
      sourceCount: result.sources.length,
      findingCount: result.findings.length,
    });
    return "created" as const;
  }
  async logError(_jobId: string, error: LoggedError) {
    this.errors.push(error);
  }
  async setCampaignStatus(_campaignId: string, status: string) {
    this.campaignStatus = status;
  }

  get savedNames() {
    return [...this.saved.values()].map((s) => s.result.candidate.name).sort();
  }
}

function bundle(discovery: DiscoveryProvider): ProviderBundle {
  return {
    discovery,
    fetcher: new FakeFetcher(),
    performance: new NullPerformanceProvider(),
    browser: new NullBrowserProvider(),
  };
}

/**
 * Memoizes completed steps like Inngest does: a step that already produced a
 * result is never re-executed. Re-running the whole function with the same
 * instance models a replay or a duplicate delivery of the same run.
 */
class MemoizingStepRunner implements JobStepRunner {
  readonly store = new Map<string, unknown>();
  readonly executed: string[] = [];
  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.store.has(id)) return this.store.get(id) as T;
    this.executed.push(id);
    const result = await fn();
    this.store.set(id, result);
    return result;
  }
}

/**
 * Runs each not-yet-completed step, but for ids matching `retryOnce` it executes
 * the step body a SECOND time before recording it — modeling at-least-once
 * execution where a worker committed a step's side effects then crashed before
 * the completion was acknowledged, so Inngest retries the step.
 */
class RetryOnceStepRunner implements JobStepRunner {
  readonly store = new Map<string, unknown>();
  readonly executions: string[] = [];
  private readonly retried = new Set<string>();
  constructor(private readonly retryOnce: (id: string) => boolean) {}
  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.store.has(id)) return this.store.get(id) as T;
    this.executions.push(id);
    let result = await fn();
    if (this.retryOnce(id) && !this.retried.has(id)) {
      this.retried.add(id);
      this.executions.push(`${id}:retry`);
      result = await fn();
    }
    this.store.set(id, result);
    return result;
  }
}

/** Throws when a step id matches `interruptAt`, modeling a killed worker. */
class InterruptingStepRunner implements JobStepRunner {
  readonly store = new Map<string, unknown>();
  constructor(private readonly interruptAt: (id: string) => boolean) {}
  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.store.has(id)) return this.store.get(id) as T;
    if (this.interruptAt(id)) throw new Error(`worker interrupted at ${id}`);
    const result = await fn();
    this.store.set(id, result);
    return result;
  }
}

describe("research durability", () => {
  it("does not duplicate work on replay / duplicate delivery of the same run", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("Alpha Dental", "https://alpha.example"),
        makeCandidate("Beta Dental", "https://beta.example"),
      ]),
    );
    const steps = new MemoizingStepRunner();

    const first = await runCampaignResearch("c1", "j1", repo, providers, { steps, sleep: noSleep });
    expect(first.status).toBe("SUCCEEDED");
    expect(repo.saved.size).toBe(2);
    const attemptsAfterFirst = repo.saveAttempts;
    const executedAfterFirst = steps.executed.length;

    // Re-run with the SAME memoized steps: models Inngest replaying / delivering
    // the same run again. Every step is memoized, so nothing re-executes.
    const second = await runCampaignResearch("c1", "j1", repo, providers, { steps, sleep: noSleep });
    expect(second.status).toBe("SUCCEEDED");
    expect(second.succeeded).toBe(2);
    expect(repo.saved.size).toBe(2); // no new clinics
    expect(repo.saveAttempts).toBe(attemptsAfterFirst); // saveClinic not called again
    expect(steps.executed.length).toBe(executedAfterFirst); // no step re-executed
  });

  it("never creates a duplicate clinic/source/finding under at-least-once step execution", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("Alpha Dental", "https://alpha.example"),
        makeCandidate("Beta Dental", "https://beta.example"),
      ]),
    );
    // Every clinic step's body runs twice (commit, "crash", retry).
    const steps = new RetryOnceStepRunner((id) => id.startsWith("clinic-"));

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { steps, sleep: noSleep });

    expect(summary.status).toBe("SUCCEEDED");
    // Each clinic step body executed twice...
    expect(steps.executions.filter((e) => e.endsWith(":retry")).length).toBe(2);
    // ...but the unique dedupe key means exactly one row per clinic, and its
    // sources/findings are stored once (they live on that single row).
    expect(repo.saved.size).toBe(2);
    expect(repo.savedNames).toEqual(["Alpha Dental", "Beta Dental"]);
    for (const rec of repo.saved.values()) {
      const keys = rec.result.sources.map((s) => `${s.type}:${s.url}`);
      expect(new Set(keys).size).toBe(keys.length); // no duplicate source URLs
    }
  });

  it("recovers an interrupted job on a fresh run, skipping already-saved clinics", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const candidates = [
      makeCandidate("Alpha Dental", "https://alpha.example"),
      makeCandidate("Beta Dental", "https://beta.example"),
      makeCandidate("Gamma Dental", "https://gamma.example"),
    ];
    const providers = bundle(new FakeDiscovery(candidates));

    // First run dies right before the second clinic (Alpha is saved, then the
    // worker is interrupted at control-1).
    const interrupted = new InterruptingStepRunner((id) => id === "control-1");
    await expect(
      runCampaignResearch("c1", "j1", repo, providers, { steps: interrupted, sleep: noSleep }),
    ).rejects.toThrow(/interrupted/);
    expect(repo.saved.size).toBe(1);

    // Recovery: a brand-new run (fresh runner, new job id). Discovery skips the
    // already-saved clinic via existingDedupeKeys, so the rest complete and no
    // duplicate is created.
    const resumed = new MemoizingStepRunner();
    const summary = await runCampaignResearch("c1", "j2", repo, providers, { steps: resumed, sleep: noSleep });

    expect(summary.status).toBe("SUCCEEDED");
    expect(repo.saved.size).toBe(3);
    expect(repo.savedNames).toEqual(["Alpha Dental", "Beta Dental", "Gamma Dental"]);
  });

  it("honors a pause requested between durable steps", async () => {
    const repo = new InMemoryRepo(CRITERIA);
    const providers = bundle(
      new FakeDiscovery([
        makeCandidate("Alpha Dental", "https://alpha.example"),
        makeCandidate("Beta Dental", "https://beta.example"),
      ]),
    );
    const steps = new MemoizingStepRunner();
    // Request a pause after the first clinic is saved.
    let saved = 0;
    const wrapped: JobStepRunner = {
      run: (id, fn) =>
        steps.run(id, async () => {
          const r = await fn();
          if (id.startsWith("clinic-")) {
            saved++;
            if (saved === 1) repo.control.pauseRequested = true;
          }
          return r;
        }),
    };

    const summary = await runCampaignResearch("c1", "j1", repo, providers, { steps: wrapped, sleep: noSleep });

    expect(summary.status).toBe("PAUSED");
    expect(repo.saved.size).toBe(1);
    expect(repo.campaignStatus).toBe("PAUSED");
  });
});
