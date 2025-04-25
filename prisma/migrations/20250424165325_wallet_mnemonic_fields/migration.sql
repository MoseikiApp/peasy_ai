/*
  Warnings:

  - You are about to drop the column `keySalt` on the `UserWallet` table. All the data in the column will be lost.
  - Added the required column `encodedMnemonic` to the `UserWallet` table without a default value. This is not possible if the table is not empty.
  - Added the required column `encodedPrivateKey` to the `UserWallet` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "UserWallet" DROP COLUMN "keySalt",
ADD COLUMN     "encodedMnemonic" VARCHAR(1256) NOT NULL,
ADD COLUMN     "encodedPrivateKey" VARCHAR(1256) NOT NULL;
