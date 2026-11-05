-- CreateEnum
CREATE TYPE "ContactPublisher" AS ENUM ('UNKNOWN', 'CLINIC', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "DecisionRole" AS ENUM ('OWNER', 'MEDICAL_DIRECTOR', 'LEAD_PHYSICIAN', 'ADMIN_LEADER', 'PHYSICIAN', 'OTHER');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "personId" TEXT,
ADD COLUMN     "publishedBy" "ContactPublisher" NOT NULL DEFAULT 'UNKNOWN';

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL DEFAULT '',
    "registrationNumber" TEXT,
    "specialty" TEXT,
    "registrationStatus" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verificationSourceUrl" TEXT,
    "isTestData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonAffiliation" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "role" "DecisionRole" NOT NULL DEFAULT 'OTHER',
    "roleTitle" TEXT,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "confidence" "Confidence" NOT NULL DEFAULT 'WEAK_INFERENCE',
    "sourceUrl" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonAffiliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "bio" TEXT,
    "publications" TEXT[],
    "interests" TEXT[],
    "sourceUrl" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonFinding" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "finding" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "confidence" "Confidence" NOT NULL,
    "isFact" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedReason" TEXT,
    "dismissedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_orgId_normalizedName_idx" ON "Person"("orgId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Person_orgId_registrationNumber_key" ON "Person"("orgId", "registrationNumber");

-- CreateIndex
CREATE INDEX "PersonAffiliation_clinicId_idx" ON "PersonAffiliation"("clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonAffiliation_personId_clinicId_key" ON "PersonAffiliation"("personId", "clinicId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonProfile_personId_key" ON "PersonProfile"("personId");

-- CreateIndex
CREATE INDEX "PersonFinding_personId_idx" ON "PersonFinding"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonFinding_personId_code_key" ON "PersonFinding"("personId", "code");

-- CreateIndex
CREATE INDEX "Contact_personId_idx" ON "Contact"("personId");

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonAffiliation" ADD CONSTRAINT "PersonAffiliation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonAffiliation" ADD CONSTRAINT "PersonAffiliation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonProfile" ADD CONSTRAINT "PersonProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFinding" ADD CONSTRAINT "PersonFinding_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
