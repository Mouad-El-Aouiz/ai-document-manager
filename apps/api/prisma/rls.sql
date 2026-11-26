-- ────────────────────────────────────────────────────────────────
-- Row-Level Security for multi-tenant isolation.
-- Idempotent: safe to re-run. Applied via `pnpm --filter @aidm/api db:rls`
-- AFTER migrations have created the tables.
--
-- Contract with the application:
--   The API MUST run `SET LOCAL app.organization_id = '<uuid>'` at the
--   start of every transaction (via `withTenant`).
--
-- If app.organization_id is not set, `current_setting(..., true)` returns
-- NULL, all policies evaluate to FALSE, and 0 rows are returned.
-- This is the safe default: a missing context never leaks data.
-- ────────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────
-- Enable RLS on every tenant-scoped table
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "Organization"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tag"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag"     ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- Drop existing policies (Idempotency)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentVersion";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
DROP POLICY IF EXISTS tenant_isolation ON "Tag";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentTag";

-- ────────────────────────────────────────────────────────────────
-- Tenant isolation policies (Fail-closed)
-- Note: Les IDs Prisma sont des TEXT, on ne doit pas caster en UUID.
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

CREATE POLICY tenant_isolation ON "Tag"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

-- DocumentTag n'a pas d'organizationId direct, on filtre via le document
CREATE POLICY tenant_isolation ON "DocumentTag"
  USING (EXISTS (
    SELECT 1 FROM "Document" d
    WHERE d.id = "DocumentTag"."documentId"
      AND d."organizationId" = NULLIF(current_setting('app.organization_id', true), '')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM "Document" d
    WHERE d.id = "DocumentTag"."documentId"
      AND d."organizationId" = NULLIF(current_setting('app.organization_id', true), '')
  ));

-- ────────────────────────────────────────────────────────────────
-- Immuabilité de l'audit et de DocumentVersion
-- ────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;
REVOKE DELETE ON "DocumentVersion" FROM aidm_app;

-- ────────────────────────────────────────────────────────────────
-- Fonction de lookup d'authentification (SECURITY DEFINER)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_lookup_user(p_email TEXT)
RETURNS TABLE (
  id TEXT,
  organization_id TEXT,
  password_hash TEXT,
  role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u."organizationId",
    u."passwordHash",
    u.role::TEXT
  FROM "User" u
  WHERE u.email = lower(p_email);
END;
$$;

-- Sécurité : seul aidm_app peut exécuter cette fonction
REVOKE ALL ON FUNCTION auth_lookup_user(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user(TEXT) TO aidm_app;

-- ────────────────────────────────────────────────────────────────
-- EXCLUSION EXPLICITE : "RefreshToken" n'est PAS sous RLS.
-- Raison : le lookup de rotation se fait avant l'authentification.
-- La sécurité repose sur le fait que le tokenHash (SHA-256) est
-- à haute entropie (256 bits) et impossible à énumérer.
-- ────────────────────────────────────────────────────────────────