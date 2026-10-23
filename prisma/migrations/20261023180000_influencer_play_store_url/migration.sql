-- AlterTable
ALTER TABLE "Influencer" ADD COLUMN "playStoreUrl" TEXT;

-- Links saved earlier were just the default campaign link; clear them so they follow name changes.
UPDATE "Influencer"
SET "appStoreUrl" = NULL
WHERE "appStoreUrl" LIKE 'https://apps.apple.com/app/apple-store/id6791996138?pt=1110627&ct=%';
