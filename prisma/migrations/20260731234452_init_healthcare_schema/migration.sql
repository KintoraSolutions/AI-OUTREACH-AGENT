-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('DISCOVERED', 'RESEARCHING', 'QUALIFIED', 'DRAFT_READY', 'NEEDS_REVIEW', 'APPROVED', 'CONTACTED', 'REPLIED', 'MEETING_BOOKED', 'NOT_INTERESTED', 'FOLLOW_UP_LATER', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('MANUAL', 'CSV_IMPORT', 'RESEARCH');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('UNKNOWN', 'VALID', 'INVALID', 'RISKY', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "FindingCategory" AS ENUM ('WEBSITE', 'SOFTWARE', 'KLEARQ', 'CONTACTABILITY', 'BUSINESS_FIT');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('VERIFIED', 'STRONG_INFERENCE', 'WEAK_INFERENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "RecommendedService" AS ENUM ('WEBSITE', 'SOFTWARE', 'KLEARQ', 'COMBINED', 'NONE');

-- CreateEnum
CREATE TYPE "ScoreConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('GENERATED', 'EDITED', 'APPROVED', 'REJECTED', 'SENT_EXTERNAL');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LEAD_CREATED', 'LEAD_UPDATED', 'LEAD_IMPORTED', 'RESEARCH_COMPLETED', 'DRAFT_GENERATED', 'DRAFT_EDITED', 'DRAFT_APPROVED', 'DRAFT_REJECTED', 'GMAIL_DRAFT_CREATED', 'MARKED_CONTACTED', 'REPLY_RECORDED', 'MEETING_BOOKED', 'NOTE_ADDED', 'STAGE_CHANGED', 'FOLLOW_UP_SCHEDULED', 'DO_NOT_CONTACT_SET');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AuditLogAction" AS ENUM ('FINDING_DISMISSED', 'FINDING_RESTORED', 'FINDING_ADDED', 'SCORE_OVERRIDDEN', 'SCORE_OVERRIDE_CLEARED', 'SCORING_RULES_UPDATED', 'SCORE_RECALCULATED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "portfolioUrl" TEXT,
    "contactUrl" TEXT,
    "senderName" TEXT,
    "senderEmail" TEXT,
    "klearqProductName" TEXT,
    "klearqTagline" TEXT,
    "klearqUrl" TEXT,
    "klearqCapabilities" TEXT[],
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "complianceAckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "accountEmail" TEXT,
    "scopes" TEXT[],
    "accessTokenEnc" TEXT,
    "refreshTokenEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchCampaign" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categories" TEXT[],
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "radiusMeters" INTEGER,
    "minLocations" INTEGER NOT NULL DEFAULT 1,
    "maxLeads" INTEGER NOT NULL DEFAULT 50,
    "requiredKeywords" TEXT[],
    "excludedKeywords" TEXT[],
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "websiteUrl" TEXT,
    "mainPhone" TEXT,
    "publicEmail" TEXT,
    "contactPageUrl" TEXT,
    "bookingMethod" TEXT,
    "onlineBookingUrl" TEXT,
    "socialLinks" JSONB,
    "businessHours" JSONB,
    "websiteTech" TEXT[],
    "locationCount" INTEGER NOT NULL DEFAULT 1,
    "dedupeKey" TEXT NOT NULL,
    "stage" "PipelineStage" NOT NULL DEFAULT 'DISCOVERED',
    "leadSource" "LeadSource" NOT NULL DEFAULT 'MANUAL',
    "doNotContact" BOOLEAN NOT NULL DEFAULT false,
    "isTestData" BOOLEAN NOT NULL DEFAULT false,
    "followUpDate" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "lastResearchedAt" TIMESTAMP(3),
    "lastAuditedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicLocation" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "label" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "hours" JSONB,
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "name" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'UNKNOWN',
    "phone" TEXT,
    "isDecisionMaker" BOOLEAN NOT NULL DEFAULT false,
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteAudit" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "performanceScore" INTEGER,
    "lcpMs" INTEGER,
    "cls" DOUBLE PRECISION,
    "mobileFriendly" BOOLEAN,
    "httpsValid" BOOLEAN,
    "screenshotKey" TEXT,
    "screenshotMobileKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" "FindingCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL DEFAULT '',
    "finding" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "subarea" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" "Confidence" NOT NULL,
    "isFact" BOOLEAN NOT NULL DEFAULT false,
    "scoreContribution" INTEGER NOT NULL DEFAULT 0,
    "manualPoints" INTEGER,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedReason" TEXT,
    "dismissedById" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadScore" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "websiteScore" INTEGER NOT NULL,
    "softwareScore" INTEGER NOT NULL,
    "klearqScore" INTEGER NOT NULL,
    "contactabilityScore" INTEGER NOT NULL,
    "businessFitScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "recommendedService" "RecommendedService" NOT NULL,
    "recommendationReason" TEXT,
    "confidence" "ScoreConfidence" NOT NULL DEFAULT 'LOW',
    "breakdown" JSONB NOT NULL,
    "weightsVersion" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manualOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideOverall" INTEGER,
    "overrideService" "RecommendedService",
    "overrideReason" TEXT,
    "overrideById" TEXT,
    "overrideAt" TIMESTAMP(3),

    CONSTRAINT "LeadScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "retrievedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "contactId" TEXT,
    "service" "RecommendedService" NOT NULL,
    "subject" TEXT NOT NULL,
    "recipientName" TEXT,
    "recipientEmail" TEXT,
    "body" TEXT NOT NULL,
    "personalizationEvidence" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reviewWarnings" TEXT[],
    "status" "DraftStatus" NOT NULL DEFAULT 'GENERATED',
    "aiModel" TEXT,
    "promptVersion" TEXT,
    "gmailDraftId" TEXT,
    "editedBody" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachActivity" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "calendarEventId" TEXT,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "emailOrDomain" TEXT NOT NULL,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "campaignId" TEXT,
    "type" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "succeeded" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "pauseRequested" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "runnerRef" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "scope" TEXT NOT NULL,
    "targetUrl" TEXT,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLogEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clinicId" TEXT,
    "action" "AuditLogAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_orgId_key" ON "Membership"("userId", "orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_orgId_provider_key" ON "Integration"("orgId", "provider");

-- CreateIndex
CREATE INDEX "SearchCampaign_orgId_idx" ON "SearchCampaign"("orgId");

-- CreateIndex
CREATE INDEX "Clinic_orgId_stage_idx" ON "Clinic"("orgId", "stage");

-- CreateIndex
CREATE INDEX "Clinic_orgId_createdAt_idx" ON "Clinic"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Clinic_orgId_dedupeKey_key" ON "Clinic"("orgId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ClinicLocation_clinicId_idx" ON "ClinicLocation"("clinicId");

-- CreateIndex
CREATE INDEX "Contact_clinicId_idx" ON "Contact"("clinicId");

-- CreateIndex
CREATE INDEX "WebsiteAudit_clinicId_idx" ON "WebsiteAudit"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteAudit_clinicId_key" ON "WebsiteAudit"("clinicId");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_idx" ON "AuditFinding"("auditId");

-- CreateIndex
CREATE INDEX "AuditFinding_code_idx" ON "AuditFinding"("code");

-- CreateIndex
CREATE UNIQUE INDEX "AuditFinding_auditId_code_key" ON "AuditFinding"("auditId", "code");

-- CreateIndex
CREATE INDEX "LeadScore_clinicId_idx" ON "LeadScore"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadScore_clinicId_key" ON "LeadScore"("clinicId");

-- CreateIndex
CREATE INDEX "Source_clinicId_idx" ON "Source"("clinicId");

-- CreateIndex
CREATE INDEX "EmailDraft_clinicId_idx" ON "EmailDraft"("clinicId");

-- CreateIndex
CREATE INDEX "OutreachActivity_clinicId_createdAt_idx" ON "OutreachActivity"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_clinicId_dueDate_idx" ON "FollowUpTask"("clinicId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_orgId_emailOrDomain_key" ON "SuppressionEntry"("orgId", "emailOrDomain");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_orgId_key_key" ON "SystemSetting"("orgId", "key");

-- CreateIndex
CREATE INDEX "ResearchJob_orgId_status_idx" ON "ResearchJob"("orgId", "status");

-- CreateIndex
CREATE INDEX "ErrorLog_jobId_idx" ON "ErrorLog"("jobId");

-- CreateIndex
CREATE INDEX "AuditLogEntry_orgId_createdAt_idx" ON "AuditLogEntry"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLogEntry_clinicId_createdAt_idx" ON "AuditLogEntry"("clinicId", "createdAt");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchCampaign" ADD CONSTRAINT "SearchCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicLocation" ADD CONSTRAINT "ClinicLocation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteAudit" ADD CONSTRAINT "WebsiteAudit_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "WebsiteAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadScore" ADD CONSTRAINT "LeadScore_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Source" ADD CONSTRAINT "Source_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachActivity" ADD CONSTRAINT "OutreachActivity_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemSetting" ADD CONSTRAINT "SystemSetting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchJob" ADD CONSTRAINT "ResearchJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SearchCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorLog" ADD CONSTRAINT "ErrorLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ResearchJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLogEntry" ADD CONSTRAINT "AuditLogEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

