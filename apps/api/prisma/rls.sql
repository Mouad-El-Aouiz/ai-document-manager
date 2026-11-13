-- Activation de la RLS
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

-- Drop des anciennes policies
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";

-- Création des policies avec WITH CHECK
-- Note: on utilise ::text car les colonnes Prisma String sont de type TEXT en DB.

CREATE POLICY tenant_isolation ON "Organization"
  USING ("id" = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK ("id" = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE POLICY tenant_isolation ON "User"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE POLICY tenant_isolation ON "Folder"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE POLICY tenant_isolation ON "Document"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE POLICY tenant_isolation ON "DocumentChunk"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text);

CREATE POLICY tenant_isolation ON "AuditLog"
  USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::text);

-- Immuabilité de l'audit
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;


-- ────────────────────────────────────────────────────────────────
-- Fonction de lookup d'authentification
-- ────────────────────────────────────────────────────────────────
-- Cette fonction s'exécute avec les droits du superuser (aidm) pour
-- contourner la RLS de manière contrôlée. Elle ne retourne que les
-- informations strictement nécessaires au login.
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