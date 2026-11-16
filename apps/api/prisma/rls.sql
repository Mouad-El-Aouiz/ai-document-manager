-- ────────────────────────────────────────────────────────────────
-- Enable RLS on all tenant-scoped tables
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "Organization"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tag"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentTag"     ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- Drop existing policies (idempotency)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentVersion";
DROP POLICY IF EXISTS tenant_isolation ON "Tag";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentTag";

-- ────────────────────────────────────────────────────────────────
-- Policies
-- Les colonnes sont de type TEXT. current_setting() renvoie TEXT.
-- On compare donc TEXT = TEXT (pas de cast ::uuid).
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

CREATE POLICY tenant_isolation ON "DocumentChunk"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "DocumentVersion"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

CREATE POLICY tenant_isolation ON "Tag"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''))
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), ''));

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
-- Immuabilité AuditLog + DocumentVersion (append-only pour aidm_app)
-- ────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;
REVOKE DELETE ON "DocumentVersion" FROM aidm_app;

-- ────────────────────────────────────────────────────────────────
-- SECURITY DEFINER : lookup login hors RLS (étape 4.6)
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
  SELECT u.id, u."organizationId", u."passwordHash", u.role::TEXT
  FROM "User" u
  WHERE u.email = lower(p_email);
END;
$$;

REVOKE ALL ON FUNCTION auth_lookup_user(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user(TEXT) TO aidm_app;