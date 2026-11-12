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

-- ────────────────────────────────────────────────────────────────
-- Rôle applicatif non-superuser (utilisé par l'API via DATABASE_URL)
-- Le rôle superuser (POSTGRES_USER) reste réservé aux migrations, au seed
-- et à l'administration. Le mot de passe de aidm_app est défini par le
-- script `db:rls` à partir de DATABASE_URL (source unique de vérité).
-- ────────────────────────────────────────────────────────────────
CREATE ROLE aidm_app WITH LOGIN;

GRANT USAGE ON SCHEMA public TO aidm_app;

-- Accorder par défaut les privilèges sur les futures tables créées par aidm
-- (les tables n'existent pas encore au moment où ce script tourne)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aidm_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO aidm_app;