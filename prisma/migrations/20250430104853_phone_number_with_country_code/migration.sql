-- CreateTable
CREATE TABLE "AddressBook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(256) NOT NULL,
    "phoneNumberWithCountryCode" VARCHAR(100),
    "walletAddress" VARCHAR(256) NOT NULL,
    "telegramHandle" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressBook_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AddressBook_userId_idx" ON "AddressBook"("userId");

-- CreateIndex
CREATE INDEX "AddressBook_walletAddress_idx" ON "AddressBook"("walletAddress");

-- AddForeignKey
ALTER TABLE "AddressBook" ADD CONSTRAINT "AddressBook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
