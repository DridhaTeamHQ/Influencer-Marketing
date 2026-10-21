-- AlterTable
ALTER TABLE "PartnerLink" ADD COLUMN "androidUrl" TEXT,
ADD COLUMN "iosUrl" TEXT;

-- Tamada Media: send phones straight to the stores, tagged for LinkedIn
UPDATE "PartnerLink"
SET "androidUrl" = 'https://play.google.com/store/apps/details?id=com.dailymattr&utm_source=linkedin&utm_medium=social&utm_campaign=tamada_media',
    "iosUrl" = 'https://apps.apple.com/in/app/dailymattr/id6791996138?utm_source=linkedin&utm_medium=social&utm_campaign=tamada_media'
WHERE "slug" = 'tamada-media';
