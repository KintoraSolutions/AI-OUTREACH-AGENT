import { AuditLogAction, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

interface LogAuditEntryInput {
  orgId: string;
  clinicId?: string | null;
  action: AuditLogAction;
  entityType: "finding" | "score" | "scoring_rules";
  entityId?: string | null;
  previousValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  reason: string;
  actorId?: string | null;
  actorName?: string | null;
  tx?: Prisma.TransactionClient;
}

/**
 * Append an immutable entry to the org's audit log (plan.md Section on manual
 * review). Every manual change to a finding, score, or the scoring rules records
 * its previous and new value, the acting user, a required reason, and a
 * timestamp. Entries are never updated or deleted.
 */
export async function logAuditEntry({
  orgId,
  clinicId,
  action,
  entityType,
  entityId,
  previousValue,
  newValue,
  reason,
  actorId,
  actorName,
  tx,
}: LogAuditEntryInput) {
  const client = tx ?? prisma;
  await client.auditLogEntry.create({
    data: {
      orgId,
      clinicId: clinicId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      previousValue: previousValue ?? Prisma.JsonNull,
      newValue: newValue ?? Prisma.JsonNull,
      reason,
      actorId: actorId ?? null,
      actorName: actorName ?? null,
    },
  });
}
