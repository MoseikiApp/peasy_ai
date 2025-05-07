-- AlterTable
ALTER TABLE "FinancialChatAction" ADD COLUMN     "commissionAmountInEth" DECIMAL(36,18),
ADD COLUMN     "commissionWalletAddress" VARCHAR(256);
