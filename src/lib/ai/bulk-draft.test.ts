import { describe, expect, it } from "vitest";
import { runBulkDrafting, type DraftJobRepository, type DraftOutcome } from "@/lib/ai/bulk-draft";
import type { JobControl, JobPatch, JobStepRunner, LoggedError } from "@/lib/research/types";

/**
 * Durability tests for bulk drafting: the same guarantees as the research
 * pipeline — retry/replay idempotency (no clinic re-drafted), batch failure
 * isolation (one failure never stops the batch), and pause between clinics.
 */

const noSleep = async () => {};

class InMemoryDraftRepo implements DraftJobRepository {
  readonly drafted: string[] = [];
  readonly callCounts = new Map<string, number>();
  readonly errors: LoggedError[] = [];
  readonly patches: JobPatch[] = [];
  control: JobControl = { cancelRequested: false, pauseRequested: false };
  pauseAfter: number | null = null;
  cancelAfter: number | null = null;

  constructor(
    private readonly clinicIds: string[],
    private readonly failFor = new Set<string>(),
    private readonly blockFor = new Set<string>(),
  ) {}

  async loadTargets() {
    return { orgId: "org1", clinicIds: this.clinicIds };
  }
  async readControl(): Promise<JobControl> {
    return {
      cancelRequested: this.control.cancelRequested || (this.cancelAfter != null && this.drafted.length >= this.cancelAfter),
      pauseRequested: this.control.pauseRequested || (this.pauseAfter != null && this.drafted.length >= this.pauseAfter),
    };
  }
  async updateJob(_jobId: string, patch: JobPatch) {
    this.patches.push(patch);
  }
  async logError(_jobId: string, error: LoggedError) {
    this.errors.push(error);
  }
  async draftClinic(_orgId: string, clinicId: string): Promise<DraftOutcome> {
    this.callCounts.set(clinicId, (this.callCounts.get(clinicId) ?? 0) + 1);
    if (this.failFor.has(clinicId)) throw new Error(`boom ${clinicId}`);
    this.drafted.push(clinicId);
    return this.blockFor.has(clinicId) ? "blocked" : "generated";
  }
}

class MemoizingStepRunner implements JobStepRunner {
  readonly store = new Map<string, unknown>();
  async run<T>(id: string, fn: () => Promise<T>): Promise<T> {
    if (this.store.has(id)) return this.store.get(id) as T;
    const result = await fn();
    this.store.set(id, result);
    return result;
  }
}

describe("runBulkDrafting", () => {
  it("drafts every qualified clinic and reports success", async () => {
    const repo = new InMemoryDraftRepo(["a", "b", "c"]);
    const summary = await runBulkDrafting("j1", repo, { sleep: noSleep });
    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.generated).toBe(3);
    expect(repo.drafted.sort()).toEqual(["a", "b", "c"]);
  });

  it("counts blocked drafts separately from generated ones", async () => {
    const repo = new InMemoryDraftRepo(["a", "b"], new Set(), new Set(["b"]));
    const summary = await runBulkDrafting("j1", repo, { sleep: noSleep });
    expect(summary.status).toBe("SUCCEEDED");
    expect(summary.generated).toBe(1);
    expect(summary.blocked).toBe(1);
  });

  it("isolates a failing clinic so the batch still completes (PARTIAL)", async () => {
    const repo = new InMemoryDraftRepo(["a", "b", "c"], new Set(["b"]));
    const summary = await runBulkDrafting("j1", repo, { sleep: noSleep });
    expect(summary.status).toBe("PARTIAL");
    expect(summary.generated).toBe(2);
    expect(summary.failed).toBe(1);
    expect(repo.drafted.sort()).toEqual(["a", "c"]);
    expect(repo.errors).toHaveLength(1);
    expect(repo.errors[0]!.scope).toBe("ai");
  });

  it("does not re-draft a completed clinic on replay (idempotent)", async () => {
    const repo = new InMemoryDraftRepo(["a", "b"]);
    const steps = new MemoizingStepRunner();
    const first = await runBulkDrafting("j1", repo, { steps, sleep: noSleep });
    expect(first.status).toBe("SUCCEEDED");
    const countsAfterFirst = new Map(repo.callCounts);

    // Replay the same run with the same memoized steps: nothing re-drafts.
    const second = await runBulkDrafting("j1", repo, { steps, sleep: noSleep });
    expect(second.status).toBe("SUCCEEDED");
    for (const [clinic, n] of repo.callCounts) {
      expect(n).toBe(countsAfterFirst.get(clinic));
    }
  });

  it("honors a pause requested between clinics", async () => {
    const repo = new InMemoryDraftRepo(["a", "b", "c"]);
    repo.pauseAfter = 1; // pause once the first clinic has been drafted
    const summary = await runBulkDrafting("j1", repo, { sleep: noSleep });
    expect(summary.status).toBe("PAUSED");
    expect(repo.drafted).toEqual(["a"]);
  });

  it("honors a cancel requested between clinics", async () => {
    const repo = new InMemoryDraftRepo(["a", "b", "c"]);
    repo.cancelAfter = 1;
    const summary = await runBulkDrafting("j1", repo, { sleep: noSleep });
    expect(summary.status).toBe("CANCELLED");
    expect(repo.drafted).toEqual(["a"]);
  });
});
