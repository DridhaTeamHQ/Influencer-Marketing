-- CreateTable
CREATE TABLE "RetiredCode" (
    "code" TEXT NOT NULL,
    "influencerId" TEXT,
    "influencerName" TEXT NOT NULL,
    "retiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetiredCode_pkey" PRIMARY KEY ("code")
);
