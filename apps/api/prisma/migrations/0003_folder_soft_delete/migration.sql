-- Add deletedAt to Folder
ALTER TABLE "Folder" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Index composite pour les requêtes par (org, parent)
CREATE INDEX "Folder_organizationId_parentId_idx" ON "Folder"("organizationId", "parentId");

-- Index unique partiel : unicité du nom parmi les frères non supprimés.
-- NULLS NOT DISTINCT (PG 15+) traite les parentId NULL comme égaux.
CREATE UNIQUE INDEX "Folder_organizationId_parentId_lower_name_key"
ON "Folder" ("organizationId", "parentId", lower("name"))
NULLS NOT DISTINCT
WHERE "deletedAt" IS NULL;