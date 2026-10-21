-- CreateTable
CREATE TABLE "PartnerLink" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerClick" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device" "DeviceType" NOT NULL,
    "os" TEXT,
    "browser" TEXT,
    "country" TEXT,
    "referrer" TEXT,
    "visitorId" TEXT NOT NULL,
    "isBot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PartnerClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerLink_slug_key" ON "PartnerLink"("slug");

-- CreateIndex
CREATE INDEX "PartnerClick_linkId_createdAt_idx" ON "PartnerClick"("linkId", "createdAt");

-- AddForeignKey
ALTER TABLE "PartnerClick" ADD CONSTRAINT "PartnerClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "PartnerLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the Tamada Media LinkedIn link
INSERT INTO "PartnerLink" ("id", "slug", "name", "channel", "destinationUrl")
VALUES ('tamada-media', 'tamada-media', 'Tamada Media', 'LinkedIn', 'https://dailymattr.com/tamada-media');
