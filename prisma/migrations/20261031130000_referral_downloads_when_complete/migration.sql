-- Downloads are now saved only once both stores have published every day up to the upload's
-- date. The earlier numbers were taken before that, so clear them to be worked out again.
UPDATE "ReferralDownload" SET "downloads" = NULL;
