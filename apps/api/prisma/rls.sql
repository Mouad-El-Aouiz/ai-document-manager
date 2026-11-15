-- ────────────────────────────────────────────────────────────────
-- 1. Activation de la RLS sur toutes les tables
-- ────────────────────────────────────────────────────────────────
ALTER TABLE "Organization"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog"      ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────────
-- 2. Suppression des anciennes policies (idempotence)
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentVersion";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";

-- ────────────────────────────────────────────────────────────────
-- 3. Création des policies (USING + WITH CHECK)
-- Note : pas de cast ::uuid, car les colonnes et current_setting sont du texte.
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
-- 4. Immuabilité de l'audit
-- ────────────────────────────────────────────────────────────────
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;

-- ────────────────────────────────────────────────────────────────
-- 5. Immuabilité des versions (pas de suppression par l'API)
-- ────────────────────────────────────────────────────────────────
REVOKE DELETE ON "DocumentVersion" FROM aidm_app;

-- ────────────────────────────────────────────────────────────────
-- 6. Fonction de lookup d'authentification (SECURITY DEFINER)
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

-- Seul aidm_app peut exécuter cette fonction
REVOKE ALL ON FUNCTION auth_lookup_user(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_lookup_user(TEXT) TO aidm_app;