/*
  Warnings:

  - You are about to drop the `ApprovalDecision` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuditLog` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `File` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Project` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "ApprovalDecision" DROP CONSTRAINT "ApprovalDecision_projectId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_projectId_fkey";

-- DropForeignKey
ALTER TABLE "File" DROP CONSTRAINT "File_projectId_fkey";

-- DropTable
DROP TABLE "ApprovalDecision";

-- DropTable
DROP TABLE "AuditLog";

-- DropTable
DROP TABLE "File";

-- DropTable
DROP TABLE "Project";

-- DropEnum
DROP TYPE "ActorRole";

-- DropEnum
DROP TYPE "ApprovalDecisionType";

-- DropEnum
DROP TYPE "LogAction";

-- DropEnum
DROP TYPE "ProjectStatus";

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "adminToken" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalHours" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "refillLink" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hours" DECIMAL(5,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_adminToken_key" ON "Client"("adminToken");

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- AddForeignKey
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
