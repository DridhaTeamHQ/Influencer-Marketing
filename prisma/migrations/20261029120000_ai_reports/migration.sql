-- CreateEnum
CREATE TYPE "AiReportKind" AS ENUM ('CONTENT', 'TRENDS');

-- CreateTable
CREATE TABLE "AiReport" (
    "id" TEXT NOT NULL,
    "kind" "AiReportKind" NOT NULL,
    "trigger" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiReport_kind_createdAt_idx" ON "AiReport"("kind", "createdAt");
