-- CreateTable
CREATE TABLE "Reel" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "shortcode" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "username" TEXT,
    "caption" TEXT,
    "thumbnailUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "durationSeconds" DOUBLE PRECISION,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "fetchedAt" TIMESTAMP(3),
    "fetchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelSnapshot" (
    "id" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "fetchedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reel_influencerId_createdAt_idx" ON "Reel"("influencerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reel_influencerId_shortcode_key" ON "Reel"("influencerId", "shortcode");

-- CreateIndex
CREATE INDEX "ReelSnapshot_reelId_fetchedAt_idx" ON "ReelSnapshot"("reelId", "fetchedAt");

-- AddForeignKey
ALTER TABLE "Reel" ADD CONSTRAINT "Reel_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelSnapshot" ADD CONSTRAINT "ReelSnapshot_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
