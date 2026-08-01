-- AlterEnum: a draft can be BLOCKED when evidence is insufficient/unsupported.
ALTER TYPE "DraftStatus" ADD VALUE 'BLOCKED';

-- AlterTable: evidence-grounded drafting fields on EmailDraft.
ALTER TABLE "EmailDraft" ADD COLUMN     "clinicName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "strategyReason" TEXT,
ADD COLUMN     "claimMap" JSONB,
ADD COLUMN     "evidenceFindingIds" TEXT[],
ADD COLUMN     "evidenceSourceUrls" TEXT[],
ADD COLUMN     "wordCount" INTEGER,
ADD COLUMN     "blockedReason" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "aiProvider" TEXT,
ADD COLUMN     "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedReason" TEXT;

-- CreateTable: immutable per-change snapshots (version history + approval record).
CREATE TABLE "DraftVersion" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "service" "RecommendedService" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reviewWarnings" TEXT[],
    "personalizationEvidence" JSONB NOT NULL,
    "claimMap" JSONB,
    "status" "DraftStatus" NOT NULL,
    "aiModel" TEXT,
    "aiProvider" TEXT,
    "promptVersion" TEXT,
    "changeType" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DraftVersion_draftId_idx" ON "DraftVersion"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftVersion_draftId_version_key" ON "DraftVersion"("draftId", "version");

-- CreateIndex: one current draft per clinic (regeneration bumps version).
CREATE UNIQUE INDEX "EmailDraft_clinicId_key" ON "EmailDraft"("clinicId");

-- AddForeignKey
ALTER TABLE "DraftVersion" ADD CONSTRAINT "DraftVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "EmailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
