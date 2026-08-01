-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "normalizedName" TEXT NOT NULL DEFAULT '';

-- Backfill normalizedName for existing rows, mirroring normalizeName() in
-- src/lib/leads/dedupe.ts: lowercase, "&" -> "and", non-alphanumerics -> spaces,
-- strip stopwords (clinic|centre|center|medical|health|group|inc|ltd|llc|the|and|of),
-- then collapse whitespace and trim. Uses Postgres word boundaries (\y).
UPDATE "Clinic" SET "normalizedName" = btrim(
  regexp_replace(
    regexp_replace(
      regexp_replace(
        replace(lower("name"), '&', 'and'),
        '[^a-z0-9]+', ' ', 'g'),
      '\y(clinic|centre|center|medical|health|group|inc|ltd|llc|the|and|of)\y', ' ', 'g'),
    '\s+', ' ', 'g')
);

-- CreateIndex
CREATE INDEX "Clinic_orgId_normalizedName_idx" ON "Clinic"("orgId", "normalizedName");
