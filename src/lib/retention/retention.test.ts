import { describe, it, expect, vi } from "vitest";
import { PipelineStage, type PrismaClient } from "@prisma/client";
import {
  PURGEABLE_STAGES,
  computeCutoff,
  purgeableClinicWhere,
  runRetentionForOrg,
} from "@/lib/retention/retention";

describe("computeCutoff", () => {
  it("subtracts retentionDays from now", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const cutoff = computeCutoff(now, 30);
    expect(cutoff.toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });
});

describe("PURGEABLE_STAGES (active-record protection)", () => {
  const ENGAGED = [
    PipelineStage.APPROVED,
    PipelineStage.GMAIL_DRAFT_CREATED,
    PipelineStage.CONTACTED,
    PipelineStage.REPLIED,
    PipelineStage.MEETING_BOOKED,
    PipelineStage.FOLLOW_UP_LATER,
  ];

  it("never includes an engaged stage", () => {
    for (const stage of ENGAGED) {
      expect(PURGEABLE_STAGES).not.toContain(stage);
    }
  });

  it("includes stale unengaged stages", () => {
    expect(PURGEABLE_STAGES).toContain(PipelineStage.DISCOVERED);
    expect(PURGEABLE_STAGES).toContain(PipelineStage.DISQUALIFIED);
    expect(PURGEABLE_STAGES).toContain(PipelineStage.NOT_INTERESTED);
  });
});

describe("purgeableClinicWhere", () => {
  it("scopes by org and excludes every active-engagement signal", () => {
    const cutoff = new Date("2026-01-01T00:00:00.000Z");
    const where = purgeableClinicWhere("org-1", cutoff);
    expect(where.orgId).toBe("org-1");
    expect(where.updatedAt).toEqual({ lt: cutoff });
    expect(where.doNotContact).toBe(false);
    expect(where.stage).toEqual({ in: PURGEABLE_STAGES });
    // Drafts in play (awaiting review or approved/sent), created Gmail drafts,
    // and pending follow-ups all protect a lead.
    expect(where.drafts).toEqual({
      none: { status: { in: ["GENERATED", "EDITED", "APPROVED", "SENT_EXTERNAL"] } },
    });
    expect(where.gmailDrafts).toEqual({ none: {} });
    expect(where.followUps).toEqual({ none: { status: "PENDING" } });
  });
});

function fakeDb(overrides: Record<string, unknown> = {}) {
  const clinicDeleteMany = vi.fn();
  const jobDeleteMany = vi.fn();
  const errorDeleteMany = vi.fn();
  const retentionCreate = vi.fn().mockResolvedValue({});
  const db = {
    clinic: {
      count: vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(2),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: clinicDeleteMany,
    },
    researchJob: { count: vi.fn().mockResolvedValue(3), deleteMany: jobDeleteMany },
    errorLog: { count: vi.fn().mockResolvedValue(1), deleteMany: errorDeleteMany },
    retentionRun: { create: retentionCreate },
    ...overrides,
  } as unknown as PrismaClient;
  return { db, clinicDeleteMany, jobDeleteMany, errorDeleteMany, retentionCreate };
}

describe("runRetentionForOrg dry run", () => {
  it("measures without deleting and records an audit row", async () => {
    const { db, clinicDeleteMany, jobDeleteMany, errorDeleteMany, retentionCreate } = fakeDb();
    const summary = await runRetentionForOrg(db, {
      orgId: "org-1",
      retentionDays: 365,
      now: new Date(),
      dryRun: true,
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.status).toBe("DRY_RUN");
    // staleTotal(5) - eligible(2) = 2 protected; eligible counts as "would purge".
    expect(summary.clinicsPurged).toBe(2);
    expect(summary.protectedSkipped).toBe(3);
    expect(summary.jobsPurged).toBe(3);
    expect(summary.errorLogsPurged).toBe(1);
    // Nothing is ever deleted in a dry run.
    expect(clinicDeleteMany).not.toHaveBeenCalled();
    expect(jobDeleteMany).not.toHaveBeenCalled();
    expect(errorDeleteMany).not.toHaveBeenCalled();
    expect(retentionCreate).toHaveBeenCalledTimes(1);
  });
});

describe("runRetentionForOrg disabled", () => {
  it("purges nothing when retentionDays is 0", async () => {
    const retentionCreate = vi.fn().mockResolvedValue({});
    const clinicCount = vi.fn();
    const db = {
      clinic: { count: clinicCount, findMany: vi.fn(), deleteMany: vi.fn() },
      researchJob: { count: vi.fn(), deleteMany: vi.fn() },
      errorLog: { count: vi.fn(), deleteMany: vi.fn() },
      retentionRun: { create: retentionCreate },
    } as unknown as PrismaClient;

    const summary = await runRetentionForOrg(db, {
      orgId: "org-1",
      retentionDays: 0,
      now: new Date(),
      dryRun: false,
    });

    expect(summary.disabled).toBe(true);
    expect(summary.clinicsPurged).toBe(0);
    // Disabled short-circuits before any counting/deleting.
    expect(clinicCount).not.toHaveBeenCalled();
    expect(retentionCreate).toHaveBeenCalledTimes(1);
  });
});
