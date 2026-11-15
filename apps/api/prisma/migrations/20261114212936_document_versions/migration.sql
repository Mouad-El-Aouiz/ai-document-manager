/*
  Warnings:

  - You are about to drop the column `mimeType` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `sizeBytes` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `storagePath` on the `Document` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[currentVersionId]` on the table `Document` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "DocumentVersionStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'SCANNING', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "mimeType",
DROP COLUMN "sizeBytes",
DROP COLUMN "status",
DROP COLUMN "storagePath",
ADD COLUMN     "currentVersionId" TEXT;

-- AlterTable
ALTER TABLE "DocumentChunk" ADD COLUMN     "documentVersionId" TEXT;

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "status" "DocumentVersionStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentVersion_organizationId_idx" ON "DocumentVersion"("organizationId");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "Document"("currentVersionId");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentVersionId_idx" ON "DocumentChunk"("documentVersionId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
