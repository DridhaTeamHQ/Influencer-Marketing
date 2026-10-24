-- Tamada Media: Play Store link with the UTM tags inside `referrer`, which Play passes to the app on install
UPDATE "PartnerLink"
SET "androidUrl" = 'https://play.google.com/store/apps/details?id=com.dailymattr&referrer=utm_source%3Dlinkedin%26utm_campaign%3Dtamada_media'
WHERE "slug" = 'download-0';
