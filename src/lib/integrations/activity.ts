import { IntegrationEventType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Append an immutable IntegrationActivity record for OAuth connections, Gmail
 * draft creation, follow-up changes, suppression blocks, and integration errors
 * (Phase 6). This table is append-only and MUST NEVER contain token material;
 * callers pass only non-sensitive context (ids, emails, counts) in `metadata`.
 */
export async function logIntegrationActivity(input: {
  orgId: string;
  type: IntegrationEventType;
  userId?: string | null;
  clinicId?: string | null;
  provider?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  tx?: Prisma.TransactionClient;
}): Promise<void> {
  const client = input.tx ?? prisma;
  await client.integrationActivity.create({
    data: {
      orgId: input.orgId,
      type: input.type,
      userId: input.userId ?? null,
      clinicId: input.clinicId ?? null,
      provider: input.provider ?? null,
      summary: input.summary,
      metadata: input.metadata ?? Prisma.JsonNull,
    },
  });
}
