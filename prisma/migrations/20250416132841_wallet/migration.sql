-- CreateTable
CREATE TABLE "UserWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" VARCHAR(256) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "network" VARCHAR(100) NOT NULL,
    "currency" VARCHAR(50) NOT NULL,
    "keySalt" VARCHAR(256) NOT NULL,
    "notes" TEXT,
    "lastOperations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "UserWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserWallet_userId_idx" ON "UserWallet"("userId");

-- CreateIndex
CREATE INDEX "UserWallet_address_idx" ON "UserWallet"("address");

-- CreateIndex
CREATE INDEX "UserWallet_network_idx" ON "UserWallet"("network");

-- CreateIndex
CREATE INDEX "UserWallet_isActive_idx" ON "UserWallet"("isActive");

-- AddForeignKey
ALTER TABLE "UserWallet" ADD CONSTRAINT "UserWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
