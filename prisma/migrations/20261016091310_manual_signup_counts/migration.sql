-- DropForeignKey
ALTER TABLE "Signup" DROP CONSTRAINT "Signup_influencerId_fkey";

-- DropTable
DROP TABLE "Signup";

-- CreateTable
CREATE TABLE "SignupCount" (
    "id" TEXT NOT NULL,
    "influencerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignupCount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SignupCount_date_idx" ON "SignupCount"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SignupCount_influencerId_date_key" ON "SignupCount"("influencerId", "date");

-- AddForeignKey
ALTER TABLE "SignupCount" ADD CONSTRAINT "SignupCount_influencerId_fkey" FOREIGN KEY ("influencerId") REFERENCES "Influencer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
