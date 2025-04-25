-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "currentPhoneNumberWithCountryCode" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneNumberWithCountryCode" TEXT;
