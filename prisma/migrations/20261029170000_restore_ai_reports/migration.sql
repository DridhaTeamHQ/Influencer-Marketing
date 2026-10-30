-- Another migration on this database dropped AiReport (it was generated from a schema without it).
-- Recreate it so the table exists whatever order the two migrations ran in.

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "AiReportKind" AS ENUM ('CONTENT', 'TRENDS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiReport" (
    "id" TEXT NOT NULL,
    "kind" "AiReportKind" NOT NULL,
    "trigger" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiReport_kind_createdAt_idx" ON "AiReport"("kind", "createdAt");
