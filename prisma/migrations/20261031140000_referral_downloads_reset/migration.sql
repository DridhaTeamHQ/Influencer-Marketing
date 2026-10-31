-- Oct 27 keeps the downloads the dashboard showed when it was uploaded; Oct 30 and 31 are removed.
UPDATE "ReferralDownload" SET "downloads" = 2184 WHERE "date" = '2026-10-27';
DELETE FROM "ReferralDownload" WHERE "date" IN ('2026-10-30', '2026-10-31');
