-- Row-Level Security for multi-tenant isolation.
-- Applied via `pnpm --filter @aidm/api db:rls` AFTER migrations.
--
-- Contract: the API runs `SET LOCAL app.organization_id = '<uuid>'` at the
-- start of every transaction (via withTenant). If unset, all policies evaluate
-- to FALSE and 0 rows are returned (fail-closed).

-- ────────────────────────────────────────────────────────────────
-- Enable RLS on every tenant-scoped table
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "Organization"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"         ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- Drop existing policies (idempotency)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentVersion";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";

-- ────────────────────────────────────────────────────────────────
-- Tenant isolation policies (TEXT = TEXT, no uuid cast)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY tenant_isolation ON "Organization"
  USING ("id" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("id" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "Folder"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "Document"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "DocumentVersion"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "DocumentChunk"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

-- ────────────────────────────────────────────────────────────────
-- Role-level restrictions
-- ────────────────────────────────────────────────────────────────
-- AuditLog is immutable at the role level
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;

-- DocumentVersion: API cannot delete (purge is handled by worker/superuser)
REVOKE DELETE ON "DocumentVersion" FROM aidm_app;