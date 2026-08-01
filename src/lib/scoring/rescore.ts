import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { scoreClinic } from "@/lib/scoring/engine";
import { storedToScorableFindings } from "@/lib/scoring/adapters";
import type { ScoreResult, ScoringConfig } from "@/lib/scoring/types";

/**
 * Recompute a clinic's score from its STORED findings and the given config, then
 * upsert the score and refresh each finding's contribution. Deterministic for the
 * same evidence + ruleset.
 *
 * Crucially, this preserves an active manual override: it rewrites only the
 * COMPUTED fields (subtotals, overall, recommendation, breakdown, ruleset
 * version) and never touches `manualOverride`/`override*`, so automated
 * recalculation cannot silently erase a human override.
 */
export async function recomputeClinicScore(
  clinicId: string,
  config: ScoringConfig,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<ScoreResult> {
  const audit = await client.websiteAudit.findFirst({
    where: { clinicId },
    include: { findings: true },
  });
  const findingRows = audit?.findings ?? [];

  const score = scoreClinic(
    storedToScorableFindings(
      findingRows.map((f) => ({
        code: f.code,
        category: f.category,
        confidence: f.confidence,
        finding: f.finding,
        evidence: f.evidence,
        sourceUrl: f.sourceUrl,
        isFact: f.isFact,
        manual: f.manual,
        manualPoints: f.manualPoints,
        dismissed: f.dismissed,
      })),
    ),
    config,
  );

  // Refresh each finding's stored contribution (dismissed -> 0).
  for (const f of findingRows) {
    const points = f.dismissed ? 0 : score.contributionByCode[f.code] ?? 0;
    if (f.scoreContribution !== points || f.ruleVersion !== score.rulesetVersion) {
      await client.auditFinding.update({
        where: { id: f.id },
        data: { scoreContribution: points, ruleVersion: score.rulesetVersion },
      });
    }
  }

  const now = new Date();
  const computed = {
    websiteScore: score.websiteScore,
    softwareScore: score.softwareScore,
    klearqScore: score.klearqScore,
    contactabilityScore: score.contactabilityScore,
    businessFitScore: score.businessFitScore,
    overallScore: score.overallScore,
    recommendedService: score.recommendedService,
    recommendationReason: score.recommendationReason,
    confidence: score.confidence,
    breakdown: score.breakdown as unknown as Prisma.InputJsonValue,
    weightsVersion: score.rulesetVersion,
    computedAt: now,
  };

  await client.leadScore.upsert({
    where: { clinicId },
    // `update` intentionally omits the manualOverride/override* fields so an
    // active override is preserved across recalculation.
    update: computed,
    create: { clinicId, ...computed },
  });
  await client.clinic.update({ where: { id: clinicId }, data: { lastAuditedAt: now } });

  return score;
}
