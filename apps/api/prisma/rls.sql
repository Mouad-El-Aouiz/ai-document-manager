-- Activation de la RLS
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Folder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentVersion" ENABLE ROW LEVEL SECURITY;

-- Drop des anciennes policies
DROP POLICY IF EXISTS tenant_isolation ON "Organization";
DROP POLICY IF EXISTS tenant_isolation ON "User";
DROP POLICY IF EXISTS tenant_isolation ON "Folder";
DROP POLICY IF EXISTS tenant_isolation ON "Document";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentChunk";
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
DROP POLICY IF EXISTS tenant_isolation ON "DocumentVersion";

-- Création des policies avec WITH CHECK (pour sécuriser les INSERT/UPDATE)
-- et NULLIF (pour fail-closed si la variable n'est pas définie).
-- On compare TEXT = TEXT (pas de cast ::uuid).

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

-- Immuabilité de l'audit
REVOKE UPDATE, DELETE ON "AuditLog" FROM aidm_app;

-- Immuabilité des versions (seul le worker/superuser peut delete)
REVOKE DELETE ON "DocumentVersion" FROM aidm_app;