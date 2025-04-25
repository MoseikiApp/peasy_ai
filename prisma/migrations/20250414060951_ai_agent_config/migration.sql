-- CreateTable
CREATE TABLE "AIAgentConfiguration" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "providerName" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "instruction" VARCHAR(10000) NOT NULL,
    "persona" VARCHAR(1000) NOT NULL,
    "randomness" DECIMAL(3,2) NOT NULL DEFAULT 0.5,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIAgentConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIAgentConfiguration_name_key" ON "AIAgentConfiguration"("name");

-- CreateIndex
CREATE INDEX "AIAgentConfiguration_name_idx" ON "AIAgentConfiguration"("name");
