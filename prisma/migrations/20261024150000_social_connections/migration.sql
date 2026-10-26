-- CreateTable
CREATE TABLE "SocialConnection" (
    "platform" "SocialPlatform" NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "refreshToken" TEXT NOT NULL,
    "error" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialConnection_pkey" PRIMARY KEY ("platform")
);
