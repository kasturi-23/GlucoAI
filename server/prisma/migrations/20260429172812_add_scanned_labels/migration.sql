-- CreateEnum
CREATE TYPE "SpikeRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "SafetyLevel" AS ENUM ('SAFE', 'CAUTION', 'AVOID');

-- CreateTable
CREATE TABLE "scanned_labels" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productName" TEXT NOT NULL DEFAULT 'Unknown Product',
    "imageUrl" TEXT,
    "nutritionJson" JSONB,
    "verdict" TEXT,
    "safetyLevel" "SafetyLevel",
    "recommendedPortion" TEXT,
    "spikeRisk" "SpikeRisk",
    "healthConcerns" TEXT[],
    "reasoning" TEXT,
    "tips" TEXT[],
    "netCarbs" DOUBLE PRECISION,
    "carbBudgetRemaining" DOUBLE PRECISION,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanned_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scanned_labels_userId_scannedAt_idx" ON "scanned_labels"("userId", "scannedAt");

-- AddForeignKey
ALTER TABLE "scanned_labels" ADD CONSTRAINT "scanned_labels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
