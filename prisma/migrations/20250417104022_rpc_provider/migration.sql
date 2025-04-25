-- CreateTable
CREATE TABLE "RpcProvider" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "currency" VARCHAR(50) NOT NULL,
    "networkUrl" VARCHAR(1000) NOT NULL,
    "testnetUrl" VARCHAR(1000) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "RpcProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RpcProvider_name_key" ON "RpcProvider"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RpcProvider_currency_key" ON "RpcProvider"("currency");

-- CreateIndex
CREATE INDEX "RpcProvider_name_idx" ON "RpcProvider"("name");

-- CreateIndex
CREATE INDEX "RpcProvider_currency_idx" ON "RpcProvider"("currency");
