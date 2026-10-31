-- AlterTable
ALTER TABLE "ReferralDownload" ADD COLUMN "downloads" INTEGER;

-- Uploads made before this column: the numbers the dashboard showed for them.
UPDATE "ReferralDownload" SET "downloads" = 2184 WHERE "date" = '2026-10-27';
UPDATE "ReferralDownload" SET "downloads" = 2398 WHERE "date" = '2026-10-30';
