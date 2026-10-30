-- CreateTable
CREATE TABLE "StoreRanking" (
    "id" TEXT NOT NULL,
    "store" "AppStore" NOT NULL,
    "date" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreRanking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreRanking_store_date_idx" ON "StoreRanking"("store", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StoreRanking_store_date_category_country_key" ON "StoreRanking"("store", "date", "category", "country");
