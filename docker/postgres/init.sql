-- Exécuté automatiquement au premier démarrage du conteneur PostgreSQL.
-- Ne s'exécute PAS si le volume existe déjà (init idempotent côté Postgres).
-- Pour rejouer : `pnpm infra:reset` puis `pnpm infra:up`.

CREATE EXTENSION IF NOT EXISTS vector;

-- Vérification rapide en logs (visible via `docker compose logs postgres`)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    RAISE NOTICE 'pgvector extension is installed: %', (SELECT extversion FROM pg_extension WHERE extname = 'vector');
  ELSE
    RAISE EXCEPTION 'pgvector extension FAILED to install';
  END IF;
END $$;