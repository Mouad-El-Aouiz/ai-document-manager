-- Migration: 0001_init_schema
-- Creates the foundational schema for Phase 1 (foundations) and Phase 2
-- (document management). RLS policies live in prisma/rls.sql (applied
-- separately via `pnpm --filter @aidm/api db:rls`).
--
-- Prerequisite: the `vector` extension must exist (created by init.sql on
-- container boot). The migration will fail loudly if it is missing.

-- Enable pgvector. Required because Prisma creates a fresh shadow database
-- when running `migrate dev`, and that database has no extensions by default.
-- IF NOT EXISTS makes this idempotent on the real database (already enabled
-- by init.sql).
CREATE EXTENSION IF NOT EXISTS vector;


-- ────────────────────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────────────────────
CREATE TYPE "UserRole"         AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');
CREATE TYPE "DocumentStatus"   AS ENUM ('PENDING', 'PROCESSING', 'INDEXED', 'ERROR');
CREATE TYPE "OrganizationPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- ────────────────────────────────────────────────────────────────
-- Tables
-- ────────────────────────────────────────────────────────────────
CREATE TABLE "Organization" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "plan"      "OrganizationPlan" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id"             TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "passwordHash"   TEXT NOT NULL,
    "role"           "UserRole" NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Folder" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "parentId"       TEXT,
    "organizationId" TEXT NOT NULL,
    "createdById"    TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    "mimeType"       TEXT NOT NULL,
    "sizeBytes"      INTEGER NOT NULL,
    "storagePath"    TEXT NOT NULL,
    "status"         "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "folderId"       TEXT,
    "organizationId" TEXT NOT NULL,
    "uploadedById"   TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DocumentChunk" (
    "id"             TEXT NOT NULL,
    "documentId"     TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chunkIndex"     INTEGER NOT NULL,
    "content"        TEXT NOT NULL,
    "embedding"      vector(768),
    "embeddingModel" TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id"             TEXT NOT NULL,
    "action"         TEXT NOT NULL,
    "entityType"     TEXT NOT NULL,
    "entityId"       TEXT NOT NULL,
    "userId"         TEXT,
    "organizationId" TEXT NOT NULL,
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- ────────────────────────────────────────────────────────────────
-- Unique indexes
-- ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "Organization_slug_key"
    ON "Organization"("slug");

CREATE UNIQUE INDEX "User_email_key"
    ON "User"("email");

CREATE UNIQUE INDEX "Document_id_organizationId_key"
    ON "Document"("id", "organizationId");

CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key"
    ON "DocumentChunk"("documentId", "chunkIndex");

-- ────────────────────────────────────────────────────────────────
-- Performance indexes
-- ────────────────────────────────────────────────────────────────
CREATE INDEX "User_organizationId_idx"
    ON "User"("organizationId");

CREATE INDEX "Folder_organizationId_idx"
    ON "Folder"("organizationId");

CREATE INDEX "Folder_parentId_idx"
    ON "Folder"("parentId");

CREATE INDEX "Document_organizationId_idx"
    ON "Document"("organizationId");

CREATE INDEX "Document_folderId_idx"
    ON "Document"("folderId");

CREATE INDEX "DocumentChunk_organizationId_idx"
    ON "DocumentChunk"("organizationId");

CREATE INDEX "AuditLog_organizationId_createdAt_idx"
    ON "AuditLog"("organizationId", "createdAt");

CREATE INDEX "AuditLog_userId_idx"
    ON "AuditLog"("userId");

-- ────────────────────────────────────────────────────────────────
-- Foreign keys
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "Folder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "Folder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Composite FK enforces that DocumentChunk.organizationId always matches the
-- parent Document.organizationId at the database level.
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_organizationId_fkey"
    FOREIGN KEY ("documentId", "organizationId")
    REFERENCES "Document"("id", "organizationId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;