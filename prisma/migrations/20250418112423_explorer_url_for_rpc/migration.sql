/*
  Warnings:

  - You are about to drop the column `testnetUrl` on the `RpcProvider` table. All the data in the column will be lost.
  - Added the required column `explorerUrl` to the `RpcProvider` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "RpcProvider" DROP COLUMN "testnetUrl",
ADD COLUMN     "explorerUrl" VARCHAR(1000) NOT NULL;
