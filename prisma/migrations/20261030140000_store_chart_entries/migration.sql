-- CreateTable
CREATE TABLE "StoreChartEntry" (
    "id" TEXT NOT NULL,
    "store" "AppStore" NOT NULL,
    "date" DATE NOT NULL,
    "rank" INTEGER NOT NULL,
    "appName" TEXT NOT NULL,
    "developer" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreChartEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreChartEntry_store_date_idx" ON "StoreChartEntry"("store", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StoreChartEntry_store_date_rank_key" ON "StoreChartEntry"("store", "date", "rank");
