import {
  DraftStatus,
  FollowUpStatus,
  JobStatus,
  PipelineStage,
  Prisma,
  RetentionRunStatus,
  type PrismaClient,
} from "@prisma/client";

/**
 * Data-retention purge (docs/planning/build-plan.md Section 12).
 *
 * A configurable per-org `retentionDays` window (0 = disabled) drives a durable,
 * idempotent purge of STALE, UNENGAGED research data. The design guarantees:
 *
 *  - **Active-record protection.** A clinic is never purged while it is engaged:
 *    approved/sent drafts, a created Gmail draft, a pending follow-up, a
 *    do-not-contact flag, or an engaged pipeline stage (approved → meeting
 *    booked, or "follow up later") all protect it permanently. Only clearly
 *    stale, unengaged leads and transient operational logs are eligible.
 *  - **Dry-run mode.** A dry run counts exactly what WOULD be purged and writes
 *    an audit record, deleting nothing.
 *  - **Batching.** Deletions run in bounded batches so a large dataset is never
 *    loaded into memory (`avoid loading full datasets`).
 *  - **Idempotency.** The cutoff is deterministic and deletes are by id, so a
 *    re-run after completion finds nothing new; interrupted runs resume safely.
 *  - **Audit log.** Every run (dry or real) appends an immutable `RetentionRun`
 *    row with counts, cutoff, actor, and status.
 *
 * The core `runRetentionForOrg` takes a `PrismaClient` so it can run from the
 * Inngest cron, a manual admin action, or the DB verification script.
 */

// Only stale leads in these stages are eligible for purge. The engaged stages
// (APPROVED, GMAIL_DRAFT_CREATED, CONTACTED, REPLIED, MEETING_BOOKED,
// FOLLOW_UP_LATER) are deliberately excluded and never purged.
export const PURGEABLE_STAGES: PipelineStage[] = [
  PipelineStage.DISCOVERED,
  PipelineStage.RESEARCHING,
  PipelineStage.QUALIFIED,
  PipelineStage.DRAFT_READY,
  PipelineStage.NEEDS_REVIEW,
  PipelineStage.NOT_INTERESTED,
  PipelineStage.DISQUALIFIED,
];

const TERMINAL_JOB_STATES: JobStatus[] = [
  JobStatus.SUCCEEDED,
  JobStatus.PARTIAL,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

const DEFAULT_BATCH_SIZE = 200;
// Hard safety cap so a logic error can never loop forever.
const MAX_BATCHES = 10_000;

export interface RetentionSummary {
  orgId: string;
  dryRun: boolean;
  disabled: boolean;
  retentionDays: number;
  cutoff: Date;
  clinicsPurged: number;
  jobsPurged: number;
  errorLogsPurged: number;
  protectedSkipped: number;
  batches: number;
  status: RetentionRunStatus;
  message?: string;
}

/** Cutoff instant: records last touched before this are stale. */
export function computeCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Prisma filter for clinics eligible to purge: stale (untouched since the
 * cutoff), in a purgeable stage, and carrying no active-engagement signal.
 */
export function purgeableClinicWhere(orgId: string, cutoff: Date): Prisma.ClinicWhereInput {
  return {
    orgId,
    updatedAt: { lt: cutoff },
    stage: { in: PURGEABLE_STAGES },
    doNotContact: false,
    // Never purge a lead that holds a draft still in play: awaiting review
    // (generated/edited) or approved/sent. Only rejected/blocked/no-draft leads
    // are eligible, so un-reviewed work is never silently deleted.
    drafts: {
      none: {
        status: {
          in: [
            DraftStatus.GENERATED,
            DraftStatus.EDITED,
            DraftStatus.APPROVED,
            DraftStatus.SENT_EXTERNAL,
          ],
        },
      },
    },
    gmailDrafts: { none: {} },
    // Never purge a lead with an outstanding follow-up.
    followUps: { none: { status: FollowUpStatus.PENDING } },
  };
}

interface RunOptions {
  orgId: string;
  retentionDays: number;
  now: Date;
  dryRun: boolean;
  actorId?: string | null;
  actorName?: string | null;
  batchSize?: number;
  /** Persist a RetentionRun audit row (default true). */
  record?: boolean;
}

/**
 * Purge (or, in dry-run mode, measure) stale data for one organization and
 * append an immutable audit record. Returns a summary.
 */
export async function runRetentionForOrg(
  db: PrismaClient,
  opts: RunOptions,
): Promise<RetentionSummary> {
  const {
    orgId,
    retentionDays,
    now,
    dryRun,
    actorId = null,
    actorName = null,
    batchSize = DEFAULT_BATCH_SIZE,
    record = true,
  } = opts;

  const cutoff = computeCutoff(now, retentionDays);

  // retentionDays <= 0 means retention is disabled: keep everything.
  if (retentionDays <= 0) {
    const summary: RetentionSummary = {
      orgId,
      dryRun,
      disabled: true,
      retentionDays,
      cutoff,
      clinicsPurged: 0,
      jobsPurged: 0,
      errorLogsPurged: 0,
      protectedSkipped: 0,
      batches: 0,
      status: dryRun ? RetentionRunStatus.DRY_RUN : RetentionRunStatus.COMPLETED,
      message: "Retention is disabled (retentionDays = 0); nothing purged.",
    };
    if (record) await writeRun(db, summary, actorId, actorName);
    return summary;
  }

  const eligibleWhere = purgeableClinicWhere(orgId, cutoff);
  const staleWhere: Prisma.ClinicWhereInput = { orgId, updatedAt: { lt: cutoff } };

  try {
    // How many stale leads are protected (engaged) and therefore skipped.
    const [staleTotal, eligibleTotal] = await Promise.all([
      db.clinic.count({ where: staleWhere }),
      db.clinic.count({ where: eligibleWhere }),
    ]);
    const protectedSkipped = Math.max(0, staleTotal - eligibleTotal);

    const oldJobWhere: Prisma.ResearchJobWhereInput = {
      orgId,
      createdAt: { lt: cutoff },
      status: { in: TERMINAL_JOB_STATES },
    };
    const oldErrorLogWhere: Prisma.ErrorLogWhereInput = {
      createdAt: { lt: cutoff },
      job: { orgId },
    };

    if (dryRun) {
      const [jobsPurged, errorLogsPurged] = await Promise.all([
        db.researchJob.count({ where: oldJobWhere }),
        db.errorLog.count({ where: oldErrorLogWhere }),
      ]);
      const summary: RetentionSummary = {
        orgId,
        dryRun: true,
        disabled: false,
        retentionDays,
        cutoff,
        clinicsPurged: eligibleTotal,
        jobsPurged,
        errorLogsPurged,
        protectedSkipped,
        batches: 0,
        status: RetentionRunStatus.DRY_RUN,
        message: `Dry run: ${eligibleTotal} lead(s), ${jobsPurged} job(s), ${errorLogsPurged} error log(s) would be purged; ${protectedSkipped} active record(s) protected.`,
      };
      if (record) await writeRun(db, summary, actorId, actorName);
      return summary;
    }

    // Real purge, in bounded batches. Deleting a clinic cascades to its
    // locations, contacts, audits, scores, sources, drafts, activities,
    // follow-ups, and Gmail draft records.
    let clinicsPurged = 0;
    let batches = 0;
    for (; batches < MAX_BATCHES; batches++) {
      const ids = await db.clinic.findMany({
        where: eligibleWhere,
        select: { id: true },
        take: batchSize,
      });
      if (ids.length === 0) break;
      const res = await db.clinic.deleteMany({
        where: { id: { in: ids.map((c) => c.id) }, orgId },
      });
      clinicsPurged += res.count;
    }

    // Purge transient operational logs older than the cutoff (error logs first,
    // so deleting their jobs does not orphan them).
    const errorLogsPurged = (await db.errorLog.deleteMany({ where: oldErrorLogWhere })).count;
    const jobsPurged = (await db.researchJob.deleteMany({ where: oldJobWhere })).count;

    const summary: RetentionSummary = {
      orgId,
      dryRun: false,
      disabled: false,
      retentionDays,
      cutoff,
      clinicsPurged,
      jobsPurged,
      errorLogsPurged,
      protectedSkipped,
      batches,
      status: RetentionRunStatus.COMPLETED,
      message: `Purged ${clinicsPurged} lead(s), ${jobsPurged} job(s), ${errorLogsPurged} error log(s) in ${batches} batch(es); ${protectedSkipped} active record(s) protected.`,
    };
    if (record) await writeRun(db, summary, actorId, actorName);
    return summary;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const summary: RetentionSummary = {
      orgId,
      dryRun,
      disabled: false,
      retentionDays,
      cutoff,
      clinicsPurged: 0,
      jobsPurged: 0,
      errorLogsPurged: 0,
      protectedSkipped: 0,
      batches: 0,
      status: RetentionRunStatus.FAILED,
      message: message.slice(0, 500),
    };
    if (record) {
      try {
        await writeRun(db, summary, actorId, actorName);
      } catch {
        // If even the audit write fails, surface the original error.
      }
    }
    throw e;
  }
}

async function writeRun(
  db: PrismaClient,
  s: RetentionSummary,
  actorId: string | null,
  actorName: string | null,
): Promise<void> {
  await db.retentionRun.create({
    data: {
      orgId: s.orgId,
      status: s.status,
      dryRun: s.dryRun,
      retentionDays: s.retentionDays,
      cutoff: s.cutoff,
      clinicsPurged: s.clinicsPurged,
      jobsPurged: s.jobsPurged,
      errorLogsPurged: s.errorLogsPurged,
      protectedSkipped: s.protectedSkipped,
      batches: s.batches,
      message: s.message ?? null,
      actorId,
      actorName,
      finishedAt: new Date(),
    },
  });
}

/**
 * Run the purge for every organization using each org's own `retentionDays`.
 * Used by the scheduled cron. Isolated per org: one org's failure is recorded
 * and does not stop the others.
 */
export async function runRetentionForAllOrgs(
  db: PrismaClient,
  now: Date,
  dryRun = false,
): Promise<RetentionSummary[]> {
  const orgs = await db.organization.findMany({ select: { id: true, retentionDays: true } });
  const summaries: RetentionSummary[] = [];
  for (const org of orgs) {
    try {
      summaries.push(
        await runRetentionForOrg(db, {
          orgId: org.id,
          retentionDays: org.retentionDays,
          now,
          dryRun,
          actorName: "Scheduled retention",
        }),
      );
    } catch {
      // The failure is already recorded as a FAILED RetentionRun; continue.
    }
  }
  return summaries;
}
