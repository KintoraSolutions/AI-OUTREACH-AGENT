-- CreateIndex
CREATE INDEX "Clinic_campaignId_collectedAt_idx" ON "Clinic"("campaignId", "collectedAt");

-- CreateIndex
CREATE INDEX "ResearchJob_campaignId_status_idx" ON "ResearchJob"("campaignId", "status");

-- CreateIndex
CREATE INDEX "ResearchJob_orgId_createdAt_idx" ON "ResearchJob"("orgId", "createdAt");
