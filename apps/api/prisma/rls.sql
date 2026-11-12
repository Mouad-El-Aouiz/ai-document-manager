-- Row-Level Security for multi-tenant isolation.
-- Idempotent: safe to re-run. Applied via `pnpm --filter @aidm/api db:rls`
-- AFTER migrations have created the tables.
--
-- Contract with the application:
--   The API MUST run `SET LOCAL app.organization_id = '<uuid>'` at the
--   start of every transaction (typically in an Express middleware that
--   wraps each request in a transaction).
--
-- If app.organization_id is not set, `current_setting(..., true)` returns
-- NULL, all policies evaluate to FALSE, and 0 rows are returned.
-- This is the safe default: a missing context never leaks data.

-- ────────────────────────────────────────────────────────────────
-- Enable RLS on every tenant-scoped table
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "Organization"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"      ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- Drop existing policies (idempotency)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";

-- ────────────────────────────────────────────────────────────────
-- Tenant isolation policies
-- ────────────────────────────────────────────────────────────────
CREATE POLICY tenant_isolation ON "Organization"
  USING ("id" = current_setting('app.organization_id', true));

CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY tenant_isolation ON "Folder"
  USING ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY tenant_isolation ON "Document"
  USING ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY tenant_isolation ON "DocumentChunk"
  USING ("organizationId" = current_setting('app.organization_id', true));

CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = current_setting('app.organization_id', true));

-- ────────────────────────────────────────────────────────────────
-- AuditLog immutability
-- Revoke UPDATE and DELETE at the role level (RLS policies for UPDATE/DELETE
-- would be permissive-by-default and thus ORed with tenant_isolation, so they
-- would NOT actually block anything). Role-level REVOKE is the reliable way.
-- ────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;