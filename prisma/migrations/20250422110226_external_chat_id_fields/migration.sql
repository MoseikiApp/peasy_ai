-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "chatExternalConversationId" TEXT,
ADD COLUMN     "chatExternalId" TEXT,
ADD COLUMN     "chatExternalProviderName" TEXT;
