-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FollowUpPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "GmailDraftStatus" AS ENUM ('PENDING', 'CREATED', 'FAILED');

-- CreateEnum
CREATE TYPE "IntegrationEventType" AS ENUM ('GOOGLE_CONNECTED', 'GOOGLE_RECONNECTED', 'GOOGLE_DISCONNECTED', 'GOOGLE_TOKEN_REFRESHED', 'GOOGLE_DEFAULT_SENDER_SET', 'GMAIL_DRAFT_CREATED', 'GMAIL_DRAFT_FAILED', 'CALENDAR_EVENT_CREATED', 'CALENDAR_EVENT_UPDATED', 'CALENDAR_EVENT_CANCELLED', 'FOLLOW_UP_CREATED', 'FOLLOW_UP_UPDATED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_CANCELLED', 'SUPPRESSION_BLOCKED', 'INTEGRATION_ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'GMAIL_DRAFT_FAILED';
ALTER TYPE "ActivityType" ADD VALUE 'FOLLOW_UP_COMPLETED';
ALTER TYPE "ActivityType" ADD VALUE 'FOLLOW_UP_CANCELLED';
ALTER TYPE "ActivityType" ADD VALUE 'CALENDAR_EVENT_CREATED';
ALTER TYPE "ActivityType" ADD VALUE 'GOOGLE_CONNECTED';
ALTER TYPE "ActivityType" ADD VALUE 'GOOGLE_DISCONNECTED';

-- AlterEnum
ALTER TYPE "PipelineStage" ADD VALUE 'GMAIL_DRAFT_CREATED';

-- AlterTable
-- Nullable-first columns.
ALTER TABLE "FollowUpTask" ADD COLUMN     "calendarConnectionId" TEXT,
ADD COLUMN     "calendarStatus" TEXT,
ADD COLUMN     "calendarSyncedAt" TIMESTAMP(3),
ADD COLUMN     "campaignId" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "priority" "FollowUpPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "title" TEXT;

-- Add NOT NULL columns as nullable, backfill from existing data, then enforce.
-- This keeps the migration safe on a table that already has follow-up rows.
ALTER TABLE "FollowUpTask" ADD COLUMN "orgId" TEXT;
ALTER TABLE "FollowUpTask" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "FollowUpTask" f SET "orgId" = c."orgId" FROM "Clinic" c WHERE f."clinicId" = c."id";
UPDATE "FollowUpTask" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
-- Existing completed tasks map to the COMPLETED status.
UPDATE "FollowUpTask" SET "status" = 'COMPLETED' WHERE "done" = true;
ALTER TABLE "FollowUpTask" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "FollowUpTask" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "googleSub" TEXT,
    "accountEmail" TEXT,
    "scopes" TEXT[],
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "isDefaultSender" BOOLEAN NOT NULL DEFAULT false,
    "revokedAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GmailDraftRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "emailDraftId" TEXT NOT NULL,
    "sourceVersion" INTEGER NOT NULL,
    "connectionId" TEXT,
    "connectionEmail" TEXT,
    "gmailDraftId" TEXT,
    "gmailMessageId" TEXT,
    "recipientEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "GmailDraftStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GmailDraftRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "clinicId" TEXT,
    "type" "IntegrationEventType" NOT NULL,
    "provider" TEXT,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoogleConnection_orgId_idx" ON "GoogleConnection"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleConnection_orgId_userId_key" ON "GoogleConnection"("orgId", "userId");

-- CreateIndex
CREATE INDEX "GmailDraftRecord_clinicId_idx" ON "GmailDraftRecord"("clinicId");

-- CreateIndex
CREATE INDEX "GmailDraftRecord_orgId_idx" ON "GmailDraftRecord"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "GmailDraftRecord_emailDraftId_sourceVersion_key" ON "GmailDraftRecord"("emailDraftId", "sourceVersion");

-- CreateIndex
CREATE INDEX "IntegrationActivity_orgId_createdAt_idx" ON "IntegrationActivity"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_orgId_status_dueDate_idx" ON "FollowUpTask"("orgId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "FollowUpTask_assigneeId_status_idx" ON "FollowUpTask"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_calendarConnectionId_fkey" FOREIGN KEY ("calendarConnectionId") REFERENCES "GoogleConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleConnection" ADD CONSTRAINT "GoogleConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailDraftRecord" ADD CONSTRAINT "GmailDraftRecord_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailDraftRecord" ADD CONSTRAINT "GmailDraftRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailDraftRecord" ADD CONSTRAINT "GmailDraftRecord_emailDraftId_fkey" FOREIGN KEY ("emailDraftId") REFERENCES "EmailDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GmailDraftRecord" ADD CONSTRAINT "GmailDraftRecord_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationActivity" ADD CONSTRAINT "IntegrationActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationActivity" ADD CONSTRAINT "IntegrationActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

