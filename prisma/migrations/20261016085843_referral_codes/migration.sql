-- AlterTable: add the column, give existing influencers a code from their handle/name, then require it
ALTER TABLE "Influencer" ADD COLUMN     "referralCode" TEXT;

WITH base AS (
  SELECT id,
         COALESCE(NULLIF(left(upper(regexp_replace(COALESCE(handle, name), '[^A-Za-z0-9]', '', 'g')), 16), ''), 'REF') AS code,
         row_number() OVER (
           PARTITION BY COALESCE(NULLIF(left(upper(regexp_replace(COALESCE(handle, name), '[^A-Za-z0-9]', '', 'g')), 16), ''), 'REF')
           ORDER BY "createdAt"
         ) AS n
  FROM "Influencer"
)
UPDATE "Influencer" i
SET "referralCode" = CASE WHEN base.n = 1 THEN base.code ELSE base.code || base.n END
FROM base
WHERE base.id = i.id;

ALTER TABLE "Influencer" ALTER COLUMN "referralCode" SET NOT NULL;

-- CreateTable
CREATE TABLE "Signup" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "device" "DeviceType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Signup_userId_key" ON "Signup"("userId");

-- CreateIndex
CREATE INDEX "Signup_influencerId_createdAt_idx" ON "Signup"("influencerId", "createdAt");

-- CreateIndex
CREATE INDEX "Signup_createdAt_idx" ON "Signup"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Influencer_referralCode_key" ON "Influencer"("referralCode");

-- AddForeignKey
ALTER TABLE "Signup" ADD CONSTRAINT "Signup_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
