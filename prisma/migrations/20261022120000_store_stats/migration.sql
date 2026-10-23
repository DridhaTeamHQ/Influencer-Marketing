
-- CreateEnum
CREATE TYPE "AppStore" AS ENUM ('GOOGLE_PLAY', 'APP_STORE');

-- CreateEnum
CREATE TYPE "StoreStatSplit" AS ENUM ('TOTAL', 'SOURCE', 'COUNTRY');

-- CreateTable
CREATE TABLE "StoreStat" (
    "id" TEXT NOT NULL,
    "store" "AppStore" NOT NULL,
    "report" TEXT NOT NULL,
    "split" "StoreStatSplit" NOT NULL,
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "utmSource" TEXT NOT NULL DEFAULT '',
    "utmCampaign" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "reinstalls" INTEGER NOT NULL DEFAULT 0,
    "uninstalls" INTEGER NOT NULL DEFAULT 0,
    "uniqueUsers" INTEGER NOT NULL DEFAULT 0,
    "activeDevices" INTEGER,

    CONSTRAINT "StoreStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreSync" (
    "key" TEXT NOT NULL,
    "version" TEXT,
    "error" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreSync_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "StoreStat_store_report_split_date_idx" ON "StoreStat"("store", "report", "split", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StoreStat_store_report_split_date_channel_utmSource_utmCamp_key" ON "StoreStat"("store", "report", "split", "date", "channel", "utmSource", "utmCampaign", "country");

