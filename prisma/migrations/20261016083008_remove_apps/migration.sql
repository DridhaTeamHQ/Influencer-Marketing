-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_appId_fkey";

-- DropForeignKey
ALTER TABLE "Link" DROP CONSTRAINT "Link_appId_fkey";

-- DropIndex
DROP INDEX "Link_influencerId_appId_key";

-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "appId";

-- AlterTable
ALTER TABLE "Link" DROP COLUMN "appId";

-- DropTable
DROP TABLE "App";

-- CreateIndex
CREATE UNIQUE INDEX "Link_influencerId_key" ON "Link"("influencerId");
