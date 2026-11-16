-- 1. Extension pg_trgm pour la recherche floue
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Ajout du champ metadata (JSONB) sur Document
ALTER TABLE "Document" ADD COLUMN "metadata" JSONB;

-- 3. Index GIN trigram sur le nom des documents pour les recherches "contains"
CREATE INDEX "Document_name_trgm_idx" ON "Document" USING GIN ("name" gin_trgm_ops);

-- 4. Création de la table Tag
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Tag_organizationId_name_key" ON "Tag"("organizationId", "name");
CREATE INDEX "Tag_organizationId_idx" ON "Tag"("organizationId");

-- 5. Création de la table DocumentTag
CREATE TABLE "DocumentTag" (
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "DocumentTag_pkey" PRIMARY KEY ("documentId", "tagId")
);

CREATE INDEX "DocumentTag_tagId_idx" ON "DocumentTag"("tagId");

-- 6. Clés étrangères
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentTag" ADD CONSTRAINT "DocumentTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;