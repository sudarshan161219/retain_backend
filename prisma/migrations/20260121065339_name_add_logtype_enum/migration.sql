/*
  Warnings:

  - Added the required column `updatedAt` to the `WorkLog` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "LogType" AS ENUM ('WORK', 'REFILL');

-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "type" "LogType" NOT NULL DEFAULT 'WORK',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;
