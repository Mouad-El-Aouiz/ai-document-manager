-- Ajout du soft delete sur Document pour la cascade logique des dossiers
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3);