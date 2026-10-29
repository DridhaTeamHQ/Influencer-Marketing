-- CreateTable
CREATE TABLE "ReferralDownload" (
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralDownload_pkey" PRIMARY KEY ("date")
);
