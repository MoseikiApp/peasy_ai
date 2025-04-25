-- CreateTable
CREATE TABLE "CryptoErc20Token" (
    "symbol" VARCHAR(50) NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "contractAddress" VARCHAR(256) NOT NULL,
    "chainId" INTEGER NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "logoURI" VARCHAR(1000),
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoErc20Token_pkey" PRIMARY KEY ("symbol")
);

-- CreateIndex
CREATE UNIQUE INDEX "CryptoErc20Token_name_key" ON "CryptoErc20Token"("name");

-- CreateIndex
CREATE INDEX "CryptoErc20Token_chainId_idx" ON "CryptoErc20Token"("chainId");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoErc20Token_symbol_chainId_key" ON "CryptoErc20Token"("symbol", "chainId");
