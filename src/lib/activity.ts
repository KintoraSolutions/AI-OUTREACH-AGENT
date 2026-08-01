import { ActivityType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

interface LogActivityInput {
  clinicId: string;
  type: ActivityType;
  actorId?: string | null;
  actorName?: string | null;
  note?: string | null;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}

/** Append an immutable audit entry to a clinic's activity timeline. */
export async function logActivity({
  clinicId,
  type,
  actorId,
  actorName,
  note,
  metadata,
  tx,
}: LogActivityInput) {
  const client = tx ?? prisma;
  await client.outreachActivity.create({
    data: {
      clinicId,
      type,
      actorId: actorId ?? null,
      actorName: actorName ?? null,
      note: note ?? null,
      metadata: metadata ?? Prisma.JsonNull,
    },
  });
}
