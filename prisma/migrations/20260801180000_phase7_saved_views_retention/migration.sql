-- CreateEnum
CREATE TYPE "RetentionRunStatus" AS ENUM ('DRY_RUN', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "status" "RetentionRunStatus" NOT NULL,
    "dryRun" BOOLEAN NOT NULL DEFAULT true,
    "retentionDays" INTEGER NOT NULL,
    "cutoff" TIMESTAMP(3) NOT NULL,
    "clinicsPurged" INTEGER NOT NULL DEFAULT 0,
    "jobsPurged" INTEGER NOT NULL DEFAULT 0,
    "errorLogsPurged" INTEGER NOT NULL DEFAULT 0,
    "protectedSkipped" INTEGER NOT NULL DEFAULT 0,
    "batches" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "RetentionRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_orgId_userId_idx" ON "SavedView"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_orgId_userId_name_key" ON "SavedView"("orgId", "userId", "name");

-- CreateIndex
CREATE INDEX "RetentionRun_orgId_startedAt_idx" ON "RetentionRun"("orgId", "startedAt");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetentionRun" ADD CONSTRAINT "RetentionRun_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

