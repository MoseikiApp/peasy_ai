-- CreateTable
CREATE TABLE "Chat" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "chatContent" TEXT NOT NULL,
    "actor" VARCHAR(50) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chatReferenceId" TEXT,
    "financialActionId" TEXT,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialChatAction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "actionType" VARCHAR(100) NOT NULL,
    "actionInputCurrency" VARCHAR(50) NOT NULL,
    "actionInputNetwork" VARCHAR(100) NOT NULL,
    "actionInputWallet" VARCHAR(256) NOT NULL,
    "actionOutputCurrency" VARCHAR(50) NOT NULL,
    "actionOutputWallet" VARCHAR(256) NOT NULL,
    "actionOutputNetwork" VARCHAR(100) NOT NULL,
    "actionApprovalType" VARCHAR(100) NOT NULL,
    "actionApprovalReferenceId" VARCHAR(256),
    "actionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actionResult" VARCHAR(100),
    "actionResultData" TEXT,
    "actionResultUserFriendlyMessage" TEXT,
    "actionResultDate" TIMESTAMP(3),
    "actionInputWalletBalanceBefore" DECIMAL(20,8),
    "actionInputWalletBalanceAfter" DECIMAL(20,8),
    "actionOutputWalletBalanceBefore" DECIMAL(20,8),
    "actionOutputWalletBalanceAfter" DECIMAL(20,8),
    "actionOutputWalletOwnerAccountId" TEXT,

    CONSTRAINT "FinancialChatAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chat_accountId_idx" ON "Chat"("accountId");

-- CreateIndex
CREATE INDEX "Chat_chatReferenceId_idx" ON "Chat"("chatReferenceId");

-- CreateIndex
CREATE INDEX "Chat_financialActionId_idx" ON "Chat"("financialActionId");

-- CreateIndex
CREATE INDEX "FinancialChatAction_accountId_idx" ON "FinancialChatAction"("accountId");

-- CreateIndex
CREATE INDEX "FinancialChatAction_actionType_idx" ON "FinancialChatAction"("actionType");

-- CreateIndex
CREATE INDEX "FinancialChatAction_actionInputNetwork_idx" ON "FinancialChatAction"("actionInputNetwork");

-- CreateIndex
CREATE INDEX "FinancialChatAction_actionOutputNetwork_idx" ON "FinancialChatAction"("actionOutputNetwork");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_chatReferenceId_fkey" FOREIGN KEY ("chatReferenceId") REFERENCES "Chat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_financialActionId_fkey" FOREIGN KEY ("financialActionId") REFERENCES "FinancialChatAction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialChatAction" ADD CONSTRAINT "FinancialChatAction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
